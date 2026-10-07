const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const fs = require('fs');
const path = require('path');
const User = require('../../models/userschema');
const sharp =require('sharp');
const { getRandomValues } = require('crypto');
const Brand = require('../../models/brandSchema');
const { cloudinary, uploadBuffer } = require('../../config/cloudinary');

/**
 * Resize an uploaded image buffer with sharp and upload it to Cloudinary.
 * Returns the hosted secure_url that gets stored in the product document.
 */
const processAndUploadProductImage = async (file) => {
    const parsed = path.parse(file.originalname || 'image');
    let ext = (parsed.ext || '').toLowerCase();

    // Normalise formats browsers don't display well to jpeg
    let targetFormat = ext.replace('.', '');
    if (['heic', 'heif', 'tiff', 'tif', 'bmp', 'avif', ''].includes(targetFormat)) {
        targetFormat = 'jpeg';
    }

    let pipeline = sharp(file.buffer).resize({ width: 450, height: 440, fit: 'cover' });
    if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
        pipeline = pipeline.jpeg({ quality: 90 });
    } else if (targetFormat === 'webp') {
        pipeline = pipeline.webp({ quality: 90 });
    } else if (targetFormat === 'png') {
        pipeline = pipeline.png();
    }

    const resizedBuffer = await pipeline.toBuffer();
    const result = await uploadBuffer(resizedBuffer, 'time-vault/product-images');
    return result.secure_url;
};

// Extract the Cloudinary public_id from a stored secure_url so old images can be deleted
const getCloudinaryPublicId = (url) => {
    if (!url || typeof url !== 'string' || !url.includes('/upload/')) return null;
    try {
        const afterUpload = url.split('/upload/')[1];           // v123/folder/name.jpg
        const withoutVersion = afterUpload.replace(/^v\d+\//, ''); // folder/name.jpg
        return withoutVersion.replace(/\.[^/.]+$/, '');          // folder/name
    } catch (e) {
        return null;
    }
};




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
                const imageUrl = await processAndUploadProductImage(req.files[i]);
                images.push(imageUrl);
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

        // Determine which existing images the user chose to keep.
        // The edit form sends `keptImages` as a JSON array of the existing
        // image URLs still shown (in display order). Fall back to all existing
        // images if the field is absent (older clients / no change).
        let keptImages;
        if (typeof updatedData.keptImages !== 'undefined') {
            try {
                keptImages = JSON.parse(updatedData.keptImages);
                if (!Array.isArray(keptImages)) keptImages = [];
            } catch (e) {
                keptImages = [];
            }
        } else {
            keptImages = [...existingProduct.productImage];
        }

        // Only keep values that actually belong to this product
        keptImages = keptImages.filter(img => existingProduct.productImage.includes(img));

        // Delete the removed images from Cloudinary (ignore legacy local filenames)
        const removedImages = existingProduct.productImage.filter(img => !keptImages.includes(img));
        for (const oldImage of removedImages) {
            const publicId = getCloudinaryPublicId(oldImage);
            if (publicId) {
                try { await cloudinary.uploader.destroy(publicId); } catch (e) {}
            }
        }

        // Upload any newly added/cropped images and append them
        let images = [...keptImages];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const imageUrl = await processAndUploadProductImage(file);
                images.push(imageUrl);
            }
        }

        // Enforce the 4-image maximum and require at least one image
        images = images.slice(0, 4);
        if (images.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'A product must have at least one image'
            });
        }
        // keep updatedData clean so keptImages isn't written to the document
        delete updatedData.keptImages;
        
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