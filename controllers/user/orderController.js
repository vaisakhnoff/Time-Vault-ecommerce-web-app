const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const User = require('../../models/userschema');
const Razorpay = require('razorpay');
const Cart = require('../../models/cartSchema');
const crypto = require('crypto');
const WalletTransaction = require('../../models/walletSchema');  // add this line
const { v4: uuidv4 } = require('uuid'); // Add this line
const multer = require('multer');
const path = require('path');
const { uploadBuffer } = require('../../config/cloudinary');

// Review images are kept in memory and streamed to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed!'));
        }
    }
});

const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,         
    key_secret: process.env.RAZORPAY_KEY_SECRET   
});

function calculateOrderStatus(items) {
    const statusCounts = items.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
    }, {});

    const totalItems = items.length;

    if (Object.keys(statusCounts).length === 1) {
        return items[0].status;
    }

   
    if (statusCounts['Delivered']) return 'Delivered';
    if (statusCounts['Out for Delivery']) return 'Out for Delivery';
    if (statusCounts['Shipped']) return 'Shipped';
    if (statusCounts['Cancelled'] === totalItems) return 'Cancelled';
    if (statusCounts['Return Requested']) return 'Return Requested';
    if (statusCounts['Returned']) return 'Returned';
    
    
    return 'Pending';
}

function calculateDisplayStatus(items) {
    const statuses = items.map(item => item.status);
    const uniqueStatuses = new Set(statuses);
    if (uniqueStatuses.size === 1) {
        return statuses[0];
    }
    return 'Mixed Status';
}

function getTimelineSteps(status) {

    const baseSteps = ['Pending', 'Shipped', 'Out for Delivery', 'Delivered'];
    
    const specialStatuses = {
        'Cancelled': ['Pending', 'Cancelled'],
        'Return Requested': ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Return Requested'],
        'Returned': ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Return Requested', 'Returned'],
        'Return Declined': ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Return Requested', 'Return Declined']
    };

    return specialStatuses[status] || baseSteps;
}

const viewOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user;

        const order = await Order.findOne({ 
            orderId: orderId,  // Changed from _id to orderId
            user: userId 
        }).populate('items.productId').lean();

        if (!order) {
            return res.redirect('/orders');
        }
        order.statusUpdates = order.statusUpdates || {};
       
        if (order.orderStatus === 'Delivered') {
        
            const pendingItems = order.items.filter(item => !item.status || item.status === 'Pending');

            order.showGlobalReturn = order.items.length > 1 && pendingItems.length === order.items.length;

         
            order.showIndividualReturn = !order.showGlobalReturn && pendingItems.length > 0;
        } else {
            order.showGlobalReturn = false;
            order.showIndividualReturn = false;
        }

        const addressDoc = await Address.findOne({ userId: userId }).lean();
        let selectedAddress = null;
        if (addressDoc && addressDoc.address && order.address) {
            selectedAddress = addressDoc.address.find(addr =>
                addr._id.toString() === order.address.toString()
            );
        }

        order.computedDisplayStatus = calculateDisplayStatus(order.items);

        res.render('orderDetails', {
            user: req.session.user,
            order: order,
            address: selectedAddress,
            getTimelineSteps: getTimelineSteps
        });
    } catch (error) {
        console.error('Error viewing order details:', error);
        res.redirect('/pageNotFound');
    }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.body.orderId;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.redirect('/orders');
    }
    
    if (order.orderStatus !== 'Pending') {
      console.error('Cancellation not allowed once order is processed');
      return res.redirect(`/order/${orderId}?error=Cancellation not allowed at this stage`);
    }
    
   
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.quantity += item.quantity;
        await product.save();
      }
    }
    
    order.orderStatus = 'Cancelled';
    order.statusUpdates = {
      ...order.statusUpdates,
      Cancelled: new Date()
    };

 
    if (
      (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet') &&
      order.paymentStatus === 'Completed'
    ) {
      const user = await User.findById(order.user);
      if (user) {
        const refundableAmount = order.items.reduce((total, item) => {
          
          if (item.status && item.status === 'Cancelled') {
            return total;
          }
          return total + Number(item.price * item.quantity);
        }, 0);
        user.wallet = (Number(user.wallet) || 0) + refundableAmount;
        console.log("User wallet updated:", user.wallet);
        await user.save();

        const walletTx = new WalletTransaction({
          userId: order.user,
          amount: refundableAmount,
          type: "Credit",
          description:
            order.paymentMethod === 'Online'
              ? `Refund for cancelled online order. ${order._id}`
              : `Refund for cancelled wallet order. ${order._id}`
        });
        await walletTx.save();
      }
    }
    
    await order.save();
    res.redirect(`/order/${orderId}`);
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.redirect('/pageNotFound');
  }
};

const submitReview = async (req, res) => {
    try {
        const { orderId, productId, rating, title, review } = req.body;
        const userId = req.session.user;

        // Upload any review images to Cloudinary and collect their hosted URLs
        let reviewImages = [];
        if (req.files && req.files.length > 0) {
            const uploads = await Promise.all(
                req.files.map(file => uploadBuffer(file.buffer, 'time-vault/review-images'))
            );
            reviewImages = uploads.map(result => result.secure_url);
        }

        // Update order item as reviewed
        await Order.updateOne(
            { _id: orderId, 'items.productId': productId },
            { $set: { 'items.$.reviewed': true } }
        );

        // Add review with images to product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            {
                $push: {
                    reviews: {
                        userId: userId,
                        rating: Number(rating),
                        title: title,
                        review: review,
                        images: reviewImages,
                        createdAt: new Date()
                    }
                }
            },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        return res.json({
            success: true,
            message: 'Review submitted successfully'
        });

    } catch (error) {
        console.error('Error submitting review:', error);
        return res.status(500).json({
            success: false,
            message: 'Error submitting review'
        });
    }
};

const createOnlineOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;
    
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    let totalAmount = cart.items.reduce((total, item) => {
      return total + item.productId.salePrice * item.quantity;
    }, 0);
    
    let couponDiscount = req.session.coupon ? req.session.coupon.offerPrice : 0;
    let discountedTotal = totalAmount - couponDiscount;
    if (discountedTotal < 0) discountedTotal = 0;

    const amountInPaise = discountedTotal * 100;
    
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: 'receipt_order_' + Date.now()
    };

    const orderData = await instance.orders.create(options);
    return res.json({ orderData });
  } catch (error) {
    console.error('Error creating online order:', error);
    return res.status(500).json({ error: 'Unable to create order' });
  }
};

const onlinePaymentSuccess = async (req, res) => {
    try {
        const userId = req.session.user;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId } = req.body;

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

       
        const originalTotalAmount = cart.items.reduce((total, item) => {
            return total + item.productId.salePrice * item.quantity;
        }, 0);

      
        const couponDiscount = req.session.coupon ? req.session.coupon.offerPrice : 0;
        
       
        const finalAmount = originalTotalAmount - couponDiscount;

   
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

        const order = new Order({
            orderId: `ORD${uuidv4().substring(0, 8).toUpperCase()}`,
            user: userId,
            items: orderItems,
            address: addressId,
            paymentMethod: 'Online',
            paymentStatus: 'Completed',
            originalTotalAmount: originalTotalAmount, // Add this field
            totalAmount: finalAmount,
            orderStatus: 'Pending',
            couponApplied: !!req.session.coupon,
            couponCode: req.session.coupon?.code || null,
            couponDiscount: couponDiscount
        });

        await order.save();

   
        for (const item of cart.items) {
            await Product.findByIdAndUpdate(
                item.productId._id, 
                { $inc: { quantity: -item.quantity } }
            );
        }

     
        cart.items = [];
        await cart.save();
        req.session.coupon = undefined;

       
        req.session.lastOrderId = order._id;

        return res.json({ success: true });
    } catch (error) {
        console.error('Error finalizing online payment:', error);
        return res.status(500).json({ success: false, error: 'Unable to finalize order' });
    }
};

const walletPaymentOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;
    
  
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    
    const originalTotalAmount = cart.items.reduce((total, item) => {
      return total + item.productId.salePrice * item.quantity;
    }, 0);
    
  
    const couponDiscount = req.session.coupon ? req.session.coupon.offerPrice : 0;
    

    const finalAmount = originalTotalAmount - couponDiscount;
    
   
    const user = await User.findById(userId);
    if (user.wallet < finalAmount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }
    
   
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

  
    const order = new Order({
      orderId: `ORD${uuidv4().substring(0, 8).toUpperCase()}`,
      user: userId,
      items: orderItems,
      address: addressId,
      paymentMethod: 'Wallet',
      paymentStatus: 'Completed',
      originalTotalAmount: originalTotalAmount, // Add required field
      totalAmount: finalAmount,
      orderStatus: 'Pending',
      couponApplied: !!req.session.coupon,
      couponCode: req.session.coupon?.code || null,
      couponDiscount: couponDiscount
    });

    await order.save();
    
  
    user.wallet -= finalAmount;
    await user.save();
    

    await new WalletTransaction({
      userId: userId,
      amount: finalAmount,
      type: "Debit",
      description: `Payment for order ${order.orderId}`,
      orderId: order._id
    }).save();
    

    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.productId._id, 
        { $inc: { quantity: -item.quantity } }
      );
    }

    cart.items = [];
    await cart.save();
    req.session.coupon = undefined;
    
    return res.json({ 
      success: true, 
      orderId: order.orderId 
    });
    
  } catch (error) {
    console.error('Error processing wallet payment:', error);
    return res.status(500).json({ 
      error: 'Unable to process wallet payment',
      details: error.message 
    });
  }
};

const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;
        const userId = req.session.user;
        
        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const item = order.items[itemIndex];
        let refundAmount = item.price * item.quantity;

       
        if (order.couponApplied && order.couponDiscount > 0) {
            // Calculate total value of all items before coupon
            const totalItemsValue = order.items.reduce((sum, item) => 
                sum + (item.price * item.quantity), 0);

          
            const itemProportion = (item.price * item.quantity) / totalItemsValue;
            
           
            const itemCouponShare = order.couponDiscount * itemProportion;
            
           
            item.couponShare = itemCouponShare;
            
           
            refundAmount = (item.price * item.quantity) - itemCouponShare;
        }

        item.status = 'Cancelled';
        item.cancellationReason = reason;

        if (order.paymentStatus === 'Completed' && 
            (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
            
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

          
            user.wallet = (user.wallet || 0) + refundAmount;
            await user.save();

           
            await new WalletTransaction({
                userId: userId,
                type: 'Credit',
                amount: refundAmount,
                description: `Refund for cancelled item from order ${order.orderId} (Including proportional coupon discount)`,
                orderId: order._id
            }).save();
        }

     
        const activeItems = order.items.filter(item => 
            !['Cancelled', 'Returned'].includes(item.status));
        if (activeItems.length === 0) {
            order.orderStatus = 'Cancelled';
        }

        await order.save();

        return res.json({
            success: true,
            message: 'Item cancelled successfully',
            refundAmount: refundAmount,
            newOrderStatus: order.orderStatus
        });

    } catch (error) {
        console.error('Error cancelling order item:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error processing cancellation' 
        });
    }
};

const returnOrderItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;
        const userId = req.session.user;

       
        const order = await Order.findOne({ 
            _id: orderId,  // Changed from orderId to _id
            user: userId 
        });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        const item = order.items.find(i => i._id.toString() === itemId);
        
        if (!item) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order item not found' 
            });
        }

        if (item.status !== 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                message: 'Only delivered items can be returned' 
            });
        }

        item.status = 'Return Requested';
        item.returnReason = reason;
     
        order.orderStatus = calculateOrderStatus(order.items);

        if (!order.statusUpdates) {
            order.statusUpdates = {};
        }
        order.statusUpdates[`item-${itemId}-Return Requested`] = new Date();

        await order.save();

        return res.json({ 
            success: true, 
            message: 'Return request submitted successfully' 
        });

    } catch (error) {
        console.error('Error processing return request:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error processing return request' 
        });
    }
};

const loadReviewPage = async (req, res) => {
    try {
        const { orderId, productId } = req.query;
        const userId = req.session.user;

        // Fetch order details
        const order = await Order.findOne({
            _id: orderId,
            user: userId
        });

        if (!order) {
            return res.redirect('/orders');
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.redirect(`/order/${orderId}`);
        }

        
        const orderItem = order.items.find(item => 
            item.productId.toString() === productId && 
            !item.reviewed && 
            order.orderStatus === 'Delivered'
        );

        if (!orderItem) {
            return res.redirect(`/order/${orderId}`);
        }

        res.render('writeReview', {
            user: req.session.user,
            order: order,
            product: product
        });

    } catch (error) {
        console.error('Error loading review page:', error);
        res.redirect('/pageNotFound');
    }
};

const createOrder = async (req, res) => {
    try {
 

        const cartItems = await Cart.findOne({ userId }).populate('items.productId');
        
      
        const originalTotal = cartItems.items.reduce((total, item) => 
            total + (item.productId.salePrice * item.quantity), 0);

        const couponApplied = req.session.coupon ? true : false;
        const couponDiscount = req.session.coupon ? req.session.coupon.discount : 0;
        
    
        const finalTotal = originalTotal - couponDiscount;

       
        const orderItems = cartItems.items.map(item => {
            const itemTotal = item.productId.salePrice * item.quantity;
            const itemProportion = itemTotal / originalTotal;
            const itemCouponShare = couponApplied ? (couponDiscount * itemProportion) : 0;

            return {
                productId: item.productId._id,
                quantity: item.quantity,
                price: item.productId.salePrice,
                originalPrice: item.productId.salePrice,
                discountedPrice: item.productId.salePrice - (itemCouponShare / item.quantity),
                couponShare: itemCouponShare
            };
        });

        const newOrder = new Order({
            user: userId,
            items: orderItems,
            address: addressId,
            paymentMethod: paymentMethod,
            originalTotalAmount: originalTotal,
            totalAmount: finalTotal,
            couponApplied,
            couponCode: req.session.coupon?.code,
            couponDiscount
        });

       
    } catch (error) {
        console.error('Error creating order:', error);
        return res.status(500).json({ success: false, message: 'Error creating order' });
    }
};

module.exports = {
    viewOrderDetails,
    cancelOrder,
    submitReview,
    loadReviewPage,   
    createOnlineOrder,
    onlinePaymentSuccess,
    walletPaymentOrder,
    cancelOrderItem,
    returnOrderItem,
    createOrder,
    upload
};