const multer = require('multer');
const path = require('path');

// Keep uploads in memory so we can resize with sharp and stream straight to Cloudinary
const storage = multer.memoryStorage();

const uploads = multer({ storage: storage });




const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController')
const categoryController = require('../controllers/admin/categoryController')
const orderController = require('../controllers/admin/orderController');
const productController = require('../controllers/admin/productController')
const auth=  require('../middleware/admin/auth')
const couponController = require('../controllers/admin/couponController');
const dashboardController = require('../controllers/admin/dashboardController');

const brandController = require('../controllers/admin/brandController');
const salesReportController = require('../controllers/admin/salesReportController');




router.get('/login',auth.adminAlreadyLoggedIn,adminController.loadLogin);
router.post('/login',adminController.login)
// router.get('/dashboard',auth.adminIsLogin,adminController.loadDashboard)
router.get('/pageError',adminController.pageError)
router.get('/logout',adminController.logout);




router.get('/users',auth.adminIsLogin,customerController.customerInfo)
router.get('/blockCustomer',auth.admincheckSession,customerController.blockCustomer);
router.get('/unblockCustomer',auth.admincheckSession,customerController.unblockCustomer)


router.get('/category',auth.adminIsLogin,categoryController.categoryInfo)
router.post('/addCategory',auth.adminIsLogin,categoryController.addCategory)
router.post('/addCategoryOffer',auth.adminIsLogin,categoryController.addCategoryOffer);
router.post('/removeCategoryoffer',auth.adminIsLogin,categoryController.removeCategoryoffer);
router.get('/listCategory',auth.adminIsLogin,categoryController.getListCategory)
router.get('/unlistCategory',auth.adminIsLogin,categoryController.getUnlistCategory)
router.get('/editCategory',auth.adminIsLogin,categoryController.getEditCategory);
router.post('/editCategory/:id', auth.admincheckSession, categoryController.editCategory);

router.get('/addProducts',auth.adminIsLogin,productController.getProductAddPage);
router.get('/products',auth.adminIsLogin,productController.getProductInfo);
router.post('/addProducts',auth.adminIsLogin,uploads.array('images',4),productController.addProducts)
router.post('/blockProduct',auth.adminIsLogin, productController.blockProduct);
router.post('/unblockProduct',auth.adminIsLogin, productController.unblockProduct);
router.get('/editProduct/:id', auth.adminIsLogin, productController.getEditProduct);
router.post('/editProduct/:id', auth.adminIsLogin, uploads.array('images', 4), productController.editProduct);
router.post('/addProductOffer', productController.addProductOffer);
router.post('/removeProductOffer', productController.removeProductOffer);

router.get('/coupon', auth.adminIsLogin, couponController.couponInfo);
router.post('/addCoupon', auth.adminIsLogin, couponController.addCoupon);
router.get('/editCoupon', auth.adminIsLogin, couponController.getEditCoupon);
router.post('/editCoupon', auth.adminIsLogin, couponController.editCoupon);
router.get('/deleteCoupon', auth.adminIsLogin, couponController.deleteCoupon);

router.get('/orders', auth.adminIsLogin, orderController.listOrders);
router.get('/order/:id', auth.adminIsLogin, orderController.viewOrderDetails);
router.post('/update-order-status', auth.adminIsLogin, orderController.updateOrderStatus);

router.get('/return-requests', auth.adminIsLogin, orderController.listReturnRequests);
router.post('/process-return-request', auth.adminIsLogin, orderController.processReturnRequest);

router.get('/dashboard', auth.adminIsLogin, dashboardController.getDashboardStats);
// router.get('/sales-report', auth.adminIsLogin, dashboardController.generateSalesReport);
router.get('/download-report', auth.adminIsLogin, dashboardController.downloadSalesReport);
router.get('/dashboard-data', auth.adminIsLogin, dashboardController.getDashboardData);
router.get('/best-selling', auth.adminIsLogin, dashboardController.getBestSellingData);
router.get('/dashboard-canceled-data', dashboardController.getCanceledAndReturnedData);

router.get('/brands', auth.adminIsLogin, brandController.getBrands);
router.get('/add-brand', auth.adminIsLogin, brandController.getAddBrandPage);
router.post('/add-brand', auth.adminIsLogin, uploads.single('brandImage'), brandController.addBrand);
router.get('/edit-brand/:id', auth.adminIsLogin, brandController.getEditBrandPage);
router.post('/edit-brand/:id', auth.adminIsLogin, uploads.single('brandImage'), brandController.editBrand);
router.post('/delete-brand/:id', auth.adminIsLogin, brandController.deleteBrand);
router.post('/toggle-brand-status/:id', auth.adminIsLogin, brandController.toggleBrandStatus);
router.post('/add-brand-offer', auth.adminIsLogin, brandController.addBrandOffer);
router.post('/remove-brand-offer', auth.adminIsLogin, brandController.removeBrandOffer);

// Sales Report Routes
router.get('/sales-report', auth.adminIsLogin, salesReportController.getSalesReport);
router.post('/sales-report/filter', auth.adminIsLogin, salesReportController.filterSalesReport);
router.get('/sales-report/download', auth.adminIsLogin, salesReportController.downloadSalesReport);

module.exports =router;
