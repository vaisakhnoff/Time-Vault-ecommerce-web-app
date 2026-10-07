const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const user = require('../../models/userschema');
const Brand = require('../../models/brandSchema');

const productDetails = async(req,res)=>{
    try {
        const userId = req.session.user;
        const productId = req.query.id;

        if (!productId) {
            console.log("No product ID provided");
            return res.redirect('/pageNotFound');
        }

       
        const product = await Product.findById(productId)
            .populate('category')
            .populate('brand')
            .populate({
                path: 'reviews.userId',
                model: 'user',
                select: 'name email'
            })
            .lean();

        if (!product) {
            console.log("Product not found");
            return res.redirect('/pageNotFound');
        }

      
        // productImage now stores full Cloudinary URLs; use them as-is

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
            isBlocked: false
        })
        .populate('brand')
        .limit(4)
        .lean();

        // related product images are full Cloudinary URLs; no transform needed

     
        const userData = userId ? await user.findById(userId).lean() : null;

        product.reviews = product.reviews || [];

        const averageRating = product.reviews.length > 0 
            ? (product.reviews.reduce((acc, review) => acc + (review.rating || 0), 0) / product.reviews.length).toFixed(1)
            : 0;

    
        const ratingCounts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
        product.reviews.forEach(review => {
            if (review && review.rating) {
                ratingCounts[review.rating] = (ratingCounts[review.rating] || 0) + 1;
            }
        });

        res.render('product-details', {
            product,
            relatedProducts,
            user: userData,
            averageRating,
            ratingCounts,
            totalReviews: product.reviews.length
        });

    } catch (error) {
        console.error("Error in product details:", error);
        res.redirect('/pageNotFound');
    }
}





module.exports = {
    productDetails
}