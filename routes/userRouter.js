const express = require('express'); 
const router = express.Router();
const path = require('path');
const multer = require('multer');

const userController = require('../controllers/user/userController');
const passport = require('passport');
const auth = require('../middleware/user/auth');
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController');
const cartController = require('../controllers/user/cartController');
const orderController = require('../controllers/user/orderController');
const wishlistController = require('../controllers/user/wishlistController');
const walletController = require("../controllers/user/walletController");

// Inline Multer configuration for review images (kept in memory, streamed to Cloudinary)
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

router.get('/', userController.loadHomepage);
router.get('/pageNotFound', userController.pageNotFound);
router.get('/login', userController.loadLoginPage);
router.post('/login', userController.login);
router.get('/signup', userController.loadSignupPage);
router.post('/signup', userController.signUp);
router.get("/logout", userController.logout);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', userController.handleGoogleAuth);
router.get('/forgotPassword', userController.forgotPassword);
router.post('/sendForgotOtp', userController.sendForgotOtp);
router.get('/resetPassword', userController.loadResetPassword);
router.post('/resetPassword', userController.resetPassword);

router.get('/contact', userController.loadContactPage);
router.post('/contact/submit', userController.submitContactForm);

router.get('/productDetails', productController.productDetails);
router.get('/shopPage', userController.loadShopPage);

router.get('/userProfile', auth.checkSession, profileController.userProfile);
router.get('/changeEmail', auth.checkSession, profileController.changeEmail);
router.post('/changeEmail', auth.checkSession, profileController.changeEmailValid);
router.post('/verifyEmailOtp', auth.checkSession, profileController.verifyEmail);
router.post('/updateEmail', auth.checkSession, profileController.updateEmail);
router.get('/changePassword', auth.checkSession, profileController.changePassword);
router.post('/changePassword', auth.checkSession, profileController.changePasswordValid);
router.post('/verifyChangePassword', auth.checkSession, profileController.verifyChangePassword);
router.get('/editProfile', auth.checkSession, profileController.editProfile);
router.post('/updateProfile', auth.checkSession, profileController.updateProfile);

router.get('/userAddress', auth.checkSession, profileController.userAddress);
router.get('/addAddress', auth.checkSession, profileController.addAddressPage);
router.post('/addAddress', auth.checkSession, profileController.addAddress);
router.get('/editAddress', auth.checkSession, profileController.editAddressPage);
router.post('/editAddress', auth.checkSession, profileController.editAddressPage);
router.post('/updateAddress', auth.checkSession, profileController.updateAddress);
router.post('/deleteAddress', auth.checkSession, profileController.deleteAddress);

router.get('/orders', auth.checkSession, profileController.userOrders);
router.get('/order/:id', auth.checkSession, orderController.viewOrderDetails);
router.post('/cancelOrder', auth.checkSession, orderController.cancelOrder);
router.post(
    '/submitReview',
    auth.checkSession,
    upload.array('reviewImages', 3), // inline multer middleware for review images
    orderController.submitReview
);
router.get('/review', orderController.loadReviewPage);
router.post('/walletPaymentOrder', auth.checkSession, orderController.walletPaymentOrder);
router.post('/order/cancelItem', auth.checkSession, orderController.cancelOrderItem);
router.post('/order/returnItem', auth.checkSession, orderController.returnOrderItem);

router.post('/createOnlineOrder', orderController.createOnlineOrder);
router.post('/onlinePaymentSuccess', orderController.onlinePaymentSuccess);

router.get('/cartPage', auth.checkSession, cartController.cartPage);
router.post('/addToCart', auth.checkSession, cartController.addToCart);
router.post('/removeFromCart', auth.checkSession, cartController.removeFromCart);
router.post('/updateCart', auth.checkSession, cartController.updateCart);
router.get('/checkoutPage', auth.checkSession, cartController.checkoutPage);
router.post('/placeOrder', auth.checkSession, cartController.placeOrder);
router.get('/orderSuccess', auth.checkSession, cartController.orderSuccess);

router.get('/wishlist', auth.checkSession, wishlistController.wishlist);
router.post('/addWishlist', wishlistController.addWishlist);
router.post('/removeFromWishlist', wishlistController.removeFromWishlist);

router.get('/wallet', auth.checkSession, walletController.wallet);
router.post('/wallet/createOrder', walletController.createOrder);
router.post('/wallet/paymentSuccess', walletController.paymentSuccess);

router.get('/referal', auth.checkSession, profileController.getReferrals);

router.post('/applyCoupon', cartController.applyCoupon);
router.post('/removeCoupon', cartController.removeCoupon);

module.exports = router;