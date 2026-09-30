const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const fs = require('fs');
const path = require('path');
const User = require('../../models/userschema');
const sharp =require('sharp');
const { getRandomValues } = require('crypto');
const Brand = require('../../models/brandSchema');




const getProductInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const perPage = 8; 
        const searchQuery = req.query.search || '';

        
        let query = {};
        if (searchQuery) {
            query.productName = { $regex: searchQuery, $options: 'i' };
        }

      
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / perPage);

        const products = await Product.find(query)
            .populate('category')
            .populate('brand') 
            .select('productName brand category regularPrice salePrice productOffer quantity isBlocked productImage') 
            .sort({ createdAt: -1 })
            .skip(page * perPage)
            .limit(perPage)
            .lean();

        res.render('products', {
            products,
            currentPage: page,
            totalPages: totalPages,
            searchQuery: searchQuery,
            perPage: perPage,
            total: totalProducts
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect('/pageError');
    }
};
  

const getProductAddPage = async(req,res)=>{
    try {
        const category = await Category.find({isListed:true});
        const brands = await Brand.find({isBlocked: false});
        
        res.render('product-add', {
            cat: category,
            brands: brands
        });
    } catch (error) {   
        console.error("Error:", error);
        res.redirect('/pageError')
    }
}

const addProducts = async(req,res)=>{
    try {
        const products = req.body;
        console.log('Product data received:', req.body);

        const productExists = await Product.findOne({
            productName: products.productName,
        });
        
        if(productExists){
            // Return JSON response for duplicate product
            return res.status(400).json({
                success: false,
                message: "Product with this name already exists",
                title: "Duplicate Product"
            });
        }

        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const originalImagePath = req.files[i].path;
                const parsed = path.parse(req.files[i].filename);
                let ext = parsed.ext.toLowerCase();

                // Ensure browser-safe output format for heic, heif, tiff, bmp, etc.
                let targetExt = ext;
                if (['.heic', '.heif', '.tiff', '.tif', '.bmp', '.avif'].includes(ext) || !ext) {
                    targetExt = '.jpeg';
                }

                const resizedFileName = 'resized-' + parsed.name + targetExt;
                const resizedImagePath = path.join('public', 'uploads', 'product-images', resizedFileName);

                let pipeline = sharp(originalImagePath).resize({ width: 450, height: 440, fit: 'cover' });
                if (targetExt === '.jpeg' || targetExt === '.jpg') {
                    pipeline = pipeline.jpeg({ quality: 90 });
                } else if (targetExt === '.webp') {
                    pipeline = pipeline.webp({ quality: 90 });
                } else if (targetExt === '.png') {
                    pipeline = pipeline.png();
                }

                await pipeline.toFile(resizedImagePath);

                // Clean up original upload if distinct from resized output
                if (fs.existsSync(originalImagePath) && originalImagePath !== resizedImagePath) {
                    try { fs.unlinkSync(originalImagePath); } catch (e) {}
                }

                images.push(resizedFileName);
            }
        }
        
        const categoryId = await Category.findOne({name:products.category});
        const brandId = await Brand.findOne({brandName: products.brand}); 
        
        if(!categoryId){
            return res.status(400).json({
                success: false,
                message: "Invalid category selected"
            });
        }

        if(!brandId){
            return res.status(400).json({
                success: false,
                message: "Invalid brand selected"
            });
        }

        const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            brand: brandId._id,
            category: categoryId._id,
            regularPrice: products.regularPrice,
            salePrice: products.salePrice,
            createdOn: new Date(),
            quantity: products.quantity,
            size: products.size,
            productImage: images,
            status: 'Available',
        });
        
        await newProduct.save();
        return res.status(200).json({
            success: true,
            message: "Product added successfully"
        });

    } catch (error) {
        console.error('Error saving product', error);
        return res.status(500).json({
            success: false,
            message: "Error occurred while adding product"
        });
    }
}

const blockProduct = async (req, res) => {
    try {
      const { id } = req.body;
      const product = await Product.findByIdAndUpdate(
        id, 
        { isBlocked: true }, 
        { new: true }
      );
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      res.json({ success: true, product });
    } catch (error) {
      console.error("Error blocking product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  };
  
  const unblockProduct = async (req, res) => {
    try {
      const { id } = req.body;
      const product = await Product.findByIdAndUpdate(
        id, 
        { isBlocked: false }, 
        { new: true }
      );
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      res.json({ success: true, product });
    } catch (error) {
      console.error("Error unblocking product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  };

const getEditProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate('category')
            .populate('brand');
            
        if (!product) {
            return res.redirect('/admin/products');
        }
        
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });
        
        res.render('edit-product', { 
            product, 
            categories,
            brands 
        });
    } catch (error) {
        console.error("Error fetching product:", error);
        res.redirect('/pageError');
    }
};
  

const editProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const updatedData = req.body;
        
        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found" 
            });
        }

        if (updatedData.productName && 
            updatedData.productName !== existingProduct.productName) {
            const duplicate = await Product.findOne({ 
                productName: updatedData.productName 
            });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: "Product already exists, please try with another name"
                });
            }
        }

        let images = [...existingProduct.productImage]; // Create a copy of existing images
        if (req.files && req.files.length > 0) {

            for (const oldImage of existingProduct.productImage) {
                const imagePath = path.join('public', 'uploads', 'product-images', oldImage);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }

            images = [];
            for (const file of req.files) {
                const parsed = path.parse(file.filename);
                let ext = parsed.ext.toLowerCase();

                let targetExt = ext;
                if (['.heic', '.heif', '.tiff', '.tif', '.bmp', '.avif'].includes(ext) || !ext) {
                    targetExt = '.jpeg';
                }

                const resizedFileName = 'resized-' + parsed.name + targetExt;
                const resizedImagePath = path.join('public', 'uploads', 'product-images', resizedFileName);
                
                let pipeline = sharp(file.path).resize({ width: 450, height: 440, fit: 'cover' });
                if (targetExt === '.jpeg' || targetExt === '.jpg') {
                    pipeline = pipeline.jpeg({ quality: 90 });
                } else if (targetExt === '.webp') {
                    pipeline = pipeline.webp({ quality: 90 });
                } else if (targetExt === '.png') {
                    pipeline = pipeline.png();
                }

                await pipeline.toFile(resizedImagePath);

                // Delete the original uploaded file
                if (fs.existsSync(file.path) && file.path !== resizedImagePath) {
                    try { fs.unlinkSync(file.path); } catch (e) {}
                }
                
                images.push(resizedFileName);
            }
        }
        
        const categoryDoc = await Category.findOne({ name: updatedData.category });
        const brandDoc = await Brand.findOne({ brandName: updatedData.brand });

        if (!categoryDoc || !brandDoc) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid category or brand' 
            });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            productId, 
            {
                ...updatedData,
                productImage: images,
                category: categoryDoc._id,
                brand: brandDoc._id,
                updatedOn: new Date()
            },
            { new: true }
        );

        return res.json({ 
            success: true, 
            product: updatedProduct 
        });
    } catch (error) {
        console.error('Error updating product:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};
  
const addProductOffer = async (req, res) => {
  try {
    const { productId, percentage } = req.body;
    if (!percentage || percentage <= 0 || percentage > 99) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer percentage'
      });
    }

    const product = await Product.findById(productId)
      .populate('category')
      .populate('brand');
      
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.oldSalePrice === undefined) {
      product.oldSalePrice = product.salePrice;
    }

    product.productOffer = percentage;
    
    
    const productFactor = product.productOffer > 0 ? (1 - product.productOffer / 100) : 1;
    const categoryFactor = (product.category && product.category.categoryOffer > 0)
      ? (1 - product.category.categoryOffer / 100) : 1;
    const brandFactor = (product.brand && product.brand.brandOffer > 0)
      ? (1 - product.brand.brandOffer / 100) : 1;
      
    const finalFactor = Math.min(productFactor, categoryFactor, brandFactor);
    
    product.salePrice = product.oldSalePrice * finalFactor;

    await product.save();

    return res.json({
      success: true,
      message: 'Offer applied successfully',
      newPrice: product.salePrice,
      productOffer: product.productOffer,
      categoryOffer: product.category?.categoryOffer,
      brandOffer: product.brand?.brandOffer
    });
  } catch (error) {
    console.error('Error adding product offer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.body;
    
    const product = await Product.findById(productId)
      .populate('category')
      .populate('brand');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    product.productOffer = 0;

    const categoryFactor = (product.category && product.category.categoryOffer > 0)
      ? (1 - product.category.categoryOffer / 100) : 1;
    const brandFactor = (product.brand && product.brand.brandOffer > 0)
      ? (1 - product.brand.brandOffer / 100) : 1;
      
    const finalFactor = Math.min(categoryFactor, brandFactor);
    
    const baseline = (typeof product.oldSalePrice !== 'undefined' && !isNaN(product.oldSalePrice))
                      ? product.oldSalePrice 
                      : product.regularPrice;
    product.salePrice = baseline * finalFactor;

    await product.save();
    
    return res.json({
      success: true,
      message: 'Product offer removed successfully',
      newPrice: product.salePrice,
      productOffer: product.productOffer,
      categoryOffer: product.category?.categoryOffer,
      brandOffer: product.brand?.brandOffer
    });
  } catch (error) {
    console.error('Error removing product offer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getProductAddPage,
  getProductInfo,
  addProducts,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  addProductOffer,
  removeProductOffer
};