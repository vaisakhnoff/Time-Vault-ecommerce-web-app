const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userschema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema.js");
const Wishlist = require("../../models/wishlistSchema");
const Coupon = require("../../models/couponSchema"); // require coupon model
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const user = require("../../models/userschema");
const cartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId).lean();
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .lean();
    if (cart && cart.items.length > 0) {
      console.log("First product details:", cart.items[0].productId);
    }

    res.render("cart", {
      user: userData,
      cart: cart || { items: [] },
    });
  } catch (error) {
    console.error("Error retrieving cart data:", error);
    res.redirect("/pageNotFound");
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.body.id;
    const quantity = parseInt(req.body.quantity) || 1;
    const fromWishlist = req.body.fromWishlist;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated", redirect: "/login" });
    }
    

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const maxAllowed = Math.min(product.quantity, 4);
    if (quantity > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${maxAllowed} quantities allowed per product`,
      });
    }

    const price = product.salePrice || product.regularPrice;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      if (newQuantity > maxAllowed) {
        return res.status(400).json({
          success: false,
          message: `You can only have a maximum of ${maxAllowed} quantities of this product in your cart`,
        });
      }
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].totalPrice = newQuantity * price;
    } else {
      if (quantity > maxAllowed) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${maxAllowed} quantities allowed per product`,
        });
      }
      cart.items.push({
        productId: product._id,
        quantity: quantity,
        price: price,
        totalPrice: price * quantity,
      });
    }

    await cart.save();

    if (fromWishlist) {
      await Wishlist.findOneAndUpdate(
        { userId },
        { $pull: { products: { productId: productId } } }
      );
    }

    res.json({ success: true, message: "Product added to cart successfully" });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res
      .status(500)
      .json({ success: false, message: "Error adding item to cart" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.redirect("/cartPage");
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );

    await cart.save();
    res.json({ success: true, message: "Item removed successfully" });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const checkoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId).lean();
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .lean();

      if (!cart || !cart.items.length) {
        return res.redirect("/");
      }
  

    const addressData = await Address.find({ userId: userId }).lean();

    const cartTotal = cart
      ? cart.items.reduce((total, item) => {
          return total + item.productId.salePrice * item.quantity;
        }, 0)
      : 0;

    const availableCoupons = await Coupon.find({
      isList: true,
      expireOn: { $gt: new Date() },
      minimumPrice: { $lte: cartTotal },
    }).lean();

  


    if (addressData && addressData.length > 0) {
      userData.addressId = addressData[0]._id;
    }

    res.render("checkoutPage", {
      user: userData,
      cart: cart || { items: [] },
      address: addressData.length > 0 ? addressData[0].address : [],
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      coupon: req.session.coupon || null,
      availableCoupons,
    });
  } catch (error) {
    console.error("Error retrieving cart data:", error);
    res.redirect("/pageNotFound");
  }
};

const placeOrder = async (req, res) => {
  try {
      const userId = req.session.user;
      const { addressId, paymentMethod } = req.body;

      // Fetch cart with populated product details
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart || cart.items.length === 0) {
          return res.status(400).json({ error: 'Cart is empty' });
      }

      // Calculate original total before any discounts
      const originalTotalAmount = cart.items.reduce((total, item) => {
          return total + (item.productId.salePrice * item.quantity);
      }, 0);

      // Get coupon discount if applied
      const couponDiscount = req.session.coupon ? req.session.coupon.offerPrice : 0;
      
      // Calculate final total after coupon
      const finalAmount = originalTotalAmount - couponDiscount;

      // Create order items with proper price tracking
      const orderItems = cart.items.map(item => {
          const itemTotal = item.productId.salePrice * item.quantity;
          const itemProportion = itemTotal / originalTotalAmount;
          const itemCouponShare = couponDiscount ? (couponDiscount * itemProportion) : 0;

          return {
              productId: item.productId._id,
              quantity: item.quantity,
              price: item.productId.salePrice,
              originalPrice: item.productId.salePrice,
              discountedPrice: item.productId.salePrice - (itemCouponShare / item.quantity),
              couponShare: itemCouponShare,
              totalPrice: itemTotal - itemCouponShare,
              status: 'Pending'
          };
      });

      // Create new order
      const order = new Order({
          orderId: `ORD${uuidv4().substring(0, 8).toUpperCase()}`,
          user: userId,
          items: orderItems,
          address: addressId,
          paymentMethod: paymentMethod,
          paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Completed',
          originalTotalAmount: originalTotalAmount,
          totalAmount: finalAmount,
          orderStatus: 'Pending',
          couponApplied: !!req.session.coupon,
          couponCode: req.session.coupon?.code || null,
          couponDiscount: couponDiscount
      });

      await order.save();

      // Update product quantities
      for (const item of cart.items) {
          await Product.findByIdAndUpdate(
              item.productId._id,
              { $inc: { quantity: -item.quantity } }
          );
      }

      // Clear cart and coupon from session
      cart.items = [];
      await cart.save();
      req.session.coupon = undefined;

      // Redirect to orderSuccess page instead of returning JSON
      return res.redirect('/orderSuccess');

  } catch (error) {
      console.error('Error placing order:', error);
      return res.status(500).json({
          success: false,
          error: 'Unable to place order'
      });
  }
};

const orderSuccess = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId).lean();

    const latestOrder = await Order.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .populate('items.productId')
      .populate('address')
      .lean();

    if (!latestOrder) {
      return res.redirect('/cartPage');
    }

    res.render('orderSuccess', {
      user: userData,
      order: latestOrder,
      orderId: latestOrder.orderId  // Changed from _id to orderId
    });
  } catch (error) {
    console.error('Error displaying order success:', error);
    return res.redirect('/pageNotFound');
  }
};

const updateCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const updatedItems = req.body.items;

    if (!updatedItems || !Array.isArray(updatedItems)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid items data" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    for (const updatedItem of updatedItems) {
      const index = cart.items.findIndex(
        (item) => item.productId.toString() === updatedItem.productId
      );
      if (index !== -1) {
        const product = await Product.findById(updatedItem.productId);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product ${updatedItem.productId} not found`,
          });
        }
        if (updatedItem.quantity > product.quantity) {
          return res.status(400).json({
            success: false,
            message: `Quantity ${updatedItem.quantity} exceeds stock (${product.quantity}) for product ${product.productName}`,
          });
        }
        cart.items[index].quantity = updatedItem.quantity;
        cart.items[index].totalPrice =
          updatedItem.quantity * cart.items[index].price;
      }
    }

    await cart.save();
    res.json({ success: true, message: "Cart updated successfully" });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ success: false, message: "Error updating cart" });
  }
};


const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    if (!couponCode || couponCode.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a coupon code" });
    }
    if (req.session.coupon) {
      return res
        .status(400)
        .json({ success: false, message: "A coupon is already applied" });
    }

    const coupon = await Coupon.findOne({
      couponCode: { $regex: new RegExp("^" + couponCode.trim() + "$", "i") },
      isList: true,
    });
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }
    if (new Date() > coupon.expireOn) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon has expired" });
    }

    const userId = req.session.user;
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .lean();
    if (!cart || !cart.items.length) {
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });
    }
    const cartTotal = cart.items.reduce((total, item) => {
      return total + item.productId.salePrice * item.quantity;
    }, 0);
    if (cartTotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Cart total must be at least ₹${coupon.minimumPrice} to apply this coupon`,
      });
    }

    
    req.session.coupon = {
      _id: coupon._id,
      code: coupon.couponCode,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice,
    };

    return res.json({
      success: true,
      message: "Coupon applied",
      coupon: {
        code: coupon.couponCode, 
        offerPrice: coupon.offerPrice,
        minimumPrice: coupon.minimumPrice
      },
      cartTotal,
      discount: coupon.offerPrice,
      grandTotal: cartTotal - coupon.offerPrice,
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    if (!req.session.coupon) {
      return res
        .status(400)
        .json({ success: false, message: "No coupon applied" });
    }
    req.session.coupon = undefined;

    const userId = req.session.user;
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .lean();
    const cartTotal = cart.items.reduce((total, item) => {
      return total + item.productId.salePrice * item.quantity;
    }, 0);

    const availableCoupons = await Coupon.find({
      isList: true,
      expireOn: { $gt: new Date() },
      minimumPrice: { $lte: cartTotal },
    }).lean();

    res.json({
      success: true,
      message: "Coupon removed successfully",
      cartTotal,
      discount: 0,
      grandTotal: cartTotal,
      availableCoupons,
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  addToCart,
  cartPage,
  removeFromCart,
  checkoutPage,
  placeOrder,
  orderSuccess,
  updateCart,
  applyCoupon,
  removeCoupon,
};
