const mongoose = require('mongoose');
const User = require('../../models/userschema');
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt');
const passport = require("passport");

const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');
const WalletTransaction = require('../../models/walletSchema');
const user = require('../../models/userschema');



const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        const categories = await Category.find({ isListed: true });
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        }).populate('category').populate('brand').lean();


        // productImage now stores full Cloudinary URLs; use them directly

        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if (userId) {
            const userData = await User.findOne({ _id: userId });

            res.render('home', { user: userData, products: productData });
        } else {
            res.render('home', { products: productData });
        }
    } catch (error) {
        console.error("Error loading homepage:", error);
        res.status(500).send("Internal Server Error");
    }
};


const pageNotFound = async (req, res) => {
    try {
        res.render('page-404');
    }
    catch (error) {
        res.redirect('/pageNotFound');
    }
}

const loadLoginPage = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render('login');

            // }else if(req.session.user && userData.isBlocked){
            //     req.session.destroy()
            //      return res.render('login',{message:'User blocked by admin'})

        }

        else {
            res.redirect('/')
        }



    }
    catch (error) {
        res.redirect('/pageNotFound')

    }


}

const loadSignupPage = async (req, res) => {
    try {
        res.render('signup');
    }
    catch (error) {
        console.log("Signup page not found");
        res.status(500).send("Internal Server Error");
    }
}

const googleAuthCallback = (req, res) => {
    req.session.user = req.user._id;
    res.redirect('/');
};


function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendverificationEmail(email, otp) {
    try {
        if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
            console.error("Email delivery is not configured. Set NODEMAILER_EMAIL and NODEMAILER_PASSWORD.");
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            requireTLS: true,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD

            }
        })



        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account ",
            text: `Your OTP is ${otp} `,
            html: `<b>Your OTP : ${otp}</b>`
        })
        return info.accepted.length > 0
    }
    catch (error) {
        console.error("Error sending email", error);
        return false

    }
}

function generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}





const signUp = async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, email, password, confirmPassword, referalCode } = req.body;

        if (password !== confirmPassword) {
            return res.render('signup', { message: "Passwords do not match" });
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', { message: "User with this email already exists" });
        }


        let newReferralCode;
        let isUnique = false;
        while (!isUnique) {
            newReferralCode = generateReferralCode();
            console.log(newReferralCode);

            const existingUser = await User.findOne({ referalCode: newReferralCode });
            if (!existingUser) {
                isUnique = true;
            }
        }


        let referrer = null;
        if (referalCode && referalCode.trim() !== "") {
            referrer = await User.findOne({ referalCode: referalCode.trim() });
            if (!referrer) {
                return res.render('signup', { message: "Invalid referral code" });
            }
        }


        const otp = generateOTP();
        const emailSend = await sendverificationEmail(email, otp);

        if (!emailSend) {
            return res.json("Email-Error");
        }


        req.session.userOtp = otp;
        req.session.userData = {
            firstName,
            lastName,
            phoneNumber,
            email,
            password,
            referalCode: referalCode ? referalCode.trim() : null,
            newReferralCode
        };

        res.render("verify-otp");
        console.log("OTP sent", otp);

    } catch (error) {
        console.error("signup error", error);
        res.redirect('/pageNotFound');
    }
}

const securePassword = async (password) => {
    try {
        return await bcrypt.hash(password, 10);
    } catch (error) {
        throw error;
    }
}





const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log("Received OTP:", otp);

        if (req.session.userOtp && otp === req.session.userOtp) {
            const userData = req.session.userData;
            const passwordHash = await securePassword(userData.password);

            const newUser = new User({
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                phoneNumber: userData.phoneNumber,
                password: passwordHash,
                referalCode: userData.newReferralCode
            });

            const savedUser = await newUser.save();

            if (userData.referalCode) {
                const referrer = await User.findOne({ referalCode: userData.referalCode });
                if (referrer) {
                    const bonusAmount = 100;
                    referrer.wallet += bonusAmount;
                    referrer.redeemedUsers.push(savedUser._id);
                    await referrer.save();


                    let refTransaction = new WalletTransaction({
                        userId: referrer._id,
                        amount: bonusAmount,
                        type: "Credit",
                        description: "Referral bonus credited"
                    });
                    await refTransaction.save();

                    savedUser.wallet += bonusAmount;
                    await savedUser.save();


                    let userTransaction = new WalletTransaction({
                        userId: savedUser._id,
                        amount: bonusAmount,
                        type: "Credit",
                        description: "Referral bonus credited"
                    });
                    await userTransaction.save();
                }
            }

            req.session.userOtp = null;
            req.session.userData = null;

            return res.json({ success: true, redirectUrl: "/login" });
        }

        if (req.session.forgotOtp && otp === req.session.forgotOtp) {
            if (!req.session.otpExpiration || Date.now() > req.session.otpExpiration) {
                req.session.forgotOtp = null;
                return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
            }
            req.session.otpVerified = true; // Mark OTP as verified for password reset
            return res.json({ success: true, redirectUrl: "/resetPassword" });
        }

        return res.status(400).json({ success: false, message: "Invalid OTP, Please try again." });

    } catch (error) {
        console.error("Error verifying OTP", error);
        res.status(500).json({ success: false, message: "An error occurred" });
    }
};




const resendOtp = async (req, res) => {
    try {
        const isForgotPassword = Boolean(req.session.forgotEmail);
        const email = isForgotPassword
            ? req.session.forgotEmail
            : req.session.userData?.email;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp2 = generateOTP();
        if (isForgotPassword) {
            req.session.forgotOtp = otp2;
            req.session.otpExpiration = Date.now() + 10 * 60 * 1000;
        } else {
            req.session.userOtp = otp2;
        }

        const emailSend2 = await sendverificationEmail(email, otp2);
        if (emailSend2) {

            res.status(200).json({ success: true, message: "OTP resent successfully" });
        } else {
            if (isForgotPassword) req.session.forgotOtp = null;
            else req.session.userOtp = null;
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error("Error sending OTP", error);
        res.status(500).json({ success: false, message: "Internal server error. Please try again later" });
    }
};



const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ isAdmin: 0, email: email });
        if (!findUser) {
            return res.render('login', { message: "Incorrect email or password" });
        }
        if (findUser.isBlocked) {
            return res.render('login', { message: "User is blocked by admin" });
        }

        if (!findUser.password) {
            return res.render('login', { message: "Incorrect email or password" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render('login', { message: "Incorrect email or password" });
        }
        req.session.user = findUser._id;
        res.redirect('/')
    } catch (error) {
        console.error("login error", error);
        res.render('login', { message: "Login failed, Please try again later" })
    }
}

const logout = async (req, res) => {
    try {
        req.session.destroy((error) => {
            if (error) {
                console.log("session destruction error", error.message);
                return res.redirect('/pageNotFound')
            }
            return res.redirect('login')
        })


    } catch (error) {
        console.log("Logout error", error);
        res.redirect('/pageNotFound')

    }
}



const handleGoogleAuth = (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {

            const message = info && info.message ? info.message : "Authentication failed";
            return res.redirect('/login?message=' + encodeURIComponent(message));
        }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }

            req.session.user = user._id;


            return res.redirect('/');
        });
    })(req, res, next);
};


const loadShopPage = async (req, res) => {
    try {

        const userId = req.session.user;
        const userData = await User.findOne({ _id: userId });

        const page = parseInt(req.query.page) || 1;
        const limit = 6
        const skip = (page - 1) * limit;

        let query = { isBlocked: false };

        if (req.query.search) {
            query.productName = { $regex: req.query.search, $options: 'i' };
        }

        if (req.query.category) {
            if (mongoose.Types.ObjectId.isValid(req.query.category)) {
                query.category = req.query.category;
            } else {
                const catDoc = await Category.findOne({ name: { $regex: new RegExp(`^${req.query.category}$`, 'i') } });
                if (catDoc) {
                    query.category = catDoc._id;
                }
            }
        }

        if (req.query.brand) {
            if (mongoose.Types.ObjectId.isValid(req.query.brand)) {
                query.brand = req.query.brand;
            } else {
                const brandDoc = await Brand.findOne({ brandName: { $regex: new RegExp(`^${req.query.brand}$`, 'i') } });
                if (brandDoc) {
                    query.brand = brandDoc._id;
                }
            }
        }


        if (req.query.minPrice || req.query.maxPrice) {
            query.regularPrice = {};
            if (req.query.minPrice) {
                query.regularPrice.$gte = parseInt(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                query.regularPrice.$lte = parseInt(req.query.maxPrice);
            }
        }

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        let sortQuery = {};
        switch (req.query.sort) {
            case 'price_asc':
                sortQuery = { regularPrice: 1 };
                break;
            case 'price_desc':
                sortQuery = { regularPrice: -1 };
                break;
            case 'name_asc':
                sortQuery = { productName: 1 };
                break;
            case 'name_desc':
                sortQuery = { productName: -1 };
                break;
            case 'brand_asc':
                sortQuery = { 'brand.brandName': 1 };
                break;
            case 'brand_desc':
                sortQuery = { 'brand.brandName': -1 };
                break;
            case 'newest':
            default:
                sortQuery = { createdAt: -1 };
        }

        let products = await Product.find(query)
            .populate('category')
            .populate('brand')
            .sort(sortQuery)
            .skip(skip)
            .limit(limit)
            .lean();

        // productImage now stores full Cloudinary URLs; use them directly

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({
                products,
                currentPage: page,
                totalPages
            });
        }

        res.render('shop', {
            products,
            currentPage: page,
            totalPages,
            categories,
            brands,
            selectedCategory: req.query.category || '',
            selectedBrand: req.query.brand || '',
            searchQuery: req.query.search || '',
            sort: req.query.sort || '',
            minPrice: req.query.minPrice || '',
            maxPrice: req.query.maxPrice || '',
            user: userData
        });

    } catch (error) {
        console.error("Error loading shop page:", error);
        res.redirect('/pageNotFound');
    }
};

const forgotPassword = async (req, res) => {

    return res.render('forgotPassword')
}

const sendForgotOtp = async (req, res) => {
    try {
        const { email } = req.body;


        const user = await User.findOne({ email });
        if (!user) {
            return res.render("forgotPassword", { message: "Email not found" });
        }


        const otp3 = generateOTP();
        const otpExpiration = Date.now() + 10 * 60 * 1000;


        req.session.otpVerified = false;
        req.session.forgotOtp = otp3;
        req.session.forgotEmail = email;
        req.session.otpExpiration = otpExpiration;


        const emailSent = await sendverificationEmail(email, otp3);
        if (!emailSent) {
            req.session.forgotOtp = null;
            req.session.forgotEmail = null;
            req.session.otpExpiration = null;
            req.session.otpVerified = false;
            return res.status(503).render("forgotPassword", {
                message: "Unable to send the recovery code. Please check the email service configuration and try again."
            });
        }


        return res.render("verify-otp", {
            message: "OTP sent to your email",
            type: "forgot"
        });

    } catch (error) {
        console.error("Error sending forgot password OTP:", error);
        return res.status(500).send("Internal Server Error");
    }
};

const loadResetPassword = (req, res) => {
    if (!req.session.otpVerified) {
        return res.redirect('/forgotPassword');
    }
    res.render('resetPassword', { message: null });
};




const resetPassword = async (req, res) => {
    if (!req.session.otpVerified) {
        return res.redirect('/forgotPassword');
    }
    try {
        const { password, confirmPassword } = req.body;
        if (password !== confirmPassword) {
            return res.render('reset-password', { message: "Passwords do not match" });
        }

        const email = req.session.forgotEmail;
        if (!email) {
            return res.redirect('/forgotPassword');
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render('resetPassword', { message: "User not found" });
        }

        const passwordHash = await securePassword(password);
        user.password = passwordHash;
        await user.save();


        req.session.otpVerified = false;
        req.session.forgotOtp = null;
        req.session.forgotEmail = null;
        req.session.otpExpiration = null;

        return res.redirect('/login');
    } catch (error) {
        console.error("Error resetting password", error);
        return res.render('reset-password', { message: "An error occurred. Please try again." });
    }
};




const loadContactPage = async (req, res) => {
    try {
        const userId = req.session.user;
        let userData;

        if (userId) {
            userData = await User.findById(userId);
        }

        res.render('contact', {
            user: userData,
            message: req.query.message || null,
            status: req.query.status || null
        });
    } catch (error) {
        console.error("Error loading contact page:", error);
        res.redirect('/pageNotFound');
    }
};


const submitContactForm = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;


        if (!name || !email || !subject || !message) {
            return res.redirect('/contact?message=All fields are required&status=error');
        }



        const emailContent = `
            Thank you for contacting us!
            
            We have received your message:
            
            Name: ${name}
            Email: ${email}
            Subject: ${subject}
            Message: ${message}
            
            We will get back to you soon.
        `;

        await sendverificationEmail(email, null, 'Contact Form Received', emailContent);

        res.redirect('/contact?message=Message sent successfully&status=success');
    } catch (error) {
        console.error("Error submitting contact form:", error);
        res.redirect('/contact?message=Error sending message&status=error');
    }
};


module.exports = {
    loadHomepage,
    pageNotFound,
    loadLoginPage,
    loadSignupPage,
    signUp,
    verifyOtp,
    resendOtp,
    login,
    logout,
    googleAuthCallback,
    loadShopPage,
    handleGoogleAuth,
    forgotPassword,
    sendForgotOtp,
    loadResetPassword,
    resetPassword,
    sendverificationEmail,
    loadContactPage,
    submitContactForm

}