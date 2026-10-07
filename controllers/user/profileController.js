const User = require('../../models/userschema');
const {sendverificationEmail}  = require('../user/userController')
const multer = require('multer');
const path = require('path');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const { log } = require('console');
const { uploadBuffer } = require('../../config/cloudinary');

function generateOTP(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

// Profile images are received as base64 and streamed to Cloudinary, so keep uploads in memory
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

const  userProfile = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId)
        res.render('profile',{
            user:userData,

        })
    } catch (error) {
        console.error('Error for retrive profile data ',error);
        res.redirect('/pageNotFound');
    }
}

const changeEmail = async (req,res)=>{
    try {
        
        const userId = req.session.user;
        const userData = await User.findById(userId).lean();
        
        if (!userData) {
            return res.redirect('/login');
        }

        res.render("change-email", {
            user: userData,
            message: req.query.message || ''
        });
    } catch (error) {
        console.error('Error loading change email page:', error);
        res.redirect('/pageNotFound');
    }
}


const changeEmailValid = async(req,res)=>{
    try {

        
        
        const {email} = req.body;
        const userExists = await User.findOne({email});
    
        
        if(userExists){
            const otp = generateOTP();
            console.log(otp);
           
            const emailSent = await sendverificationEmail(email,otp);
          
            if(emailSent){
               
    req.session.userOtp = otp;
    req.session.userData = req.body;
    req.session.email = email;
    res.render('verifyEmail-otp')
    console.log("email sent",otp);
            }
    else{
     
        res.json("email-error")
    }
}
else{
    
    
    res.render('change-email');
    message:"user with this email not exist"
}
            
    } catch (error) {
        
       res.redirect('/pageNotFound')
    }
  }


  const verifyEmail = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp===req.session.userOtp){
            req.session.userData = req.body.userData;
          
            
            res.render("new-email",
                {
                    userData : req.session.userData,

                }
            )
        }
        else{
            console.log("ho");
            
            res.render('change-email',
                {
                    message:"OTP not matching",
                    userData : req.session.userData
                }
            )
        }
    } catch (error) {
        res.redirect('/pageNotFound')
    }
  }

const updateEmail = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login'); // or send an error message
        }
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId, { email: newEmail });
        res.redirect('/userProfile');
    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound');
    }
};

const changePassword = async (req,res)=>{
    try {

        const userId = req.session.user;
        const userData = await User.findById(userId).lean();
    
       

        res.render("change-password", {
            user: userData,
            message: req.query.message || ''
        });

    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

const changePasswordValid = async(req,res)=>{
    try {
       const {email} = req.body;
       const userExists = await User.findOne({email});
       if(userExists){
        const otp = generateOTP();
        const emailsent = await sendverificationEmail(email,otp)
        if(emailsent){
            req.session.userOtp = otp;
            req.session.userData = req.body;
            req.session.email = email;
            res.render('change-password-otp')
            console.log("OTP :",otp);
            
        }else{
            res.json({
                success:false,
                message:"Failed to send otp . Please try again"
            })
        }
       }else{
        res.render('change-password',{
            message: "User with this email does not exist"
        })

       }
    } catch (error) {
        console.log("error in change password validation",error);
        res.redirect('/pageNotFound')
    }
}

const verifyChangePassword = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp===req.session.userOtp){
res.json({success:true,redirectUrl:"/resetPassword"})

        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured , please try again later" })
    }
}

const editProfile = async(req,res)=>{
    try {

        const userId = req.session.user;
        const userData = await User.findById(userId).lean();
    
       
        res.render("editProfile", {
            user: userData,
            message: req.query.message || ''
        });

       
    } catch (error) {
        console.log("error in edit profile ",error);
        res.redirect('/pageNotFound')
    }
}

const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        
        
        const base64Image = req.body.croppedImage;
        
        if (!base64Image) {
            return res.status(400).json({ 
                success: false, 
                message: 'No image provided' 
            });
        }

       
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Upload the cropped profile image to Cloudinary and store the hosted URL
        const result = await uploadBuffer(imageBuffer, 'time-vault/profile', {
            public_id: `profile-${userId}-${Date.now()}`,
        });

        await User.findByIdAndUpdate(userId, {
            profileImage: result.secure_url // Store the Cloudinary URL
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            redirectUrl: '/userProfile'
        });

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
};

const userAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).lean();
        
        
        const addressDoc = await Address.findOne({ userId: userId });
        
        if (!addressDoc) {
            return res.render('userAddress', {
                user: userData,
                addresses: [],
                currentPage: 1,
                totalPages: 0,
                message: req.query.message || ''
            });
        }

        const perPage = 3; 
        const page = parseInt(req.query.page) || 1; 
        
        
        const totalAddresses = addressDoc.address.length;
        const totalPages = Math.ceil(totalAddresses / perPage);
        
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        const paginatedAddresses = addressDoc.address.slice(startIndex, endIndex);
        
        const formattedAddresses = [{
            _id: addressDoc._id,
            address: paginatedAddresses
        }];

        res.render('userAddress', {
            user: userData,
            addresses: formattedAddresses,
            currentPage: page,
            totalPages: totalPages,
            message: req.query.message || ''
        });

    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.redirect('/pageNotFound');
    }
}

const addAddressPage = async(req,res)=>{
    try {

      const from = req.query.from;

        const userId = req.session.user;
        const userData = await User.findById(userId).lean();

        res.render('addAddress',{
            user:userData,
            from
        })
        
    } catch (error) {
        
    }
}




const addAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId).lean(); 

    if (!userData) {
      console.error("User not found!");
      return res.redirect('/userAddress?message=User not found&status=failure');
    }

    const { addressType, name, city, landMark, state, pincode, phone_no, altPhone_no ,from} = req.body;

    let userAddress = await Address.findOne({ userId });

    if (!userAddress) {
    
      userAddress = new Address({
        userId,
        address: [{ addressType, name, city, landMark, state, pincode, phone_no, altPhone_no }]
      });
    } else {
      
      userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone_no, altPhone_no });
    }

    await userAddress.save(); 
if(from==="checkoutPage"){
    return res.redirect('/checkoutPage');
}
else{
  res.redirect('/userAddress?message=Address added successfully&status=success');
}
  } catch (error) {
    console.error('Error adding address:', error);
    res.redirect('/userAddress?message=Error adding address&status=failure');
  }
};




const editAddressPage = async (req, res) => {
  try {
      const userId = req.session.user;
      // Read from query parameters
      const addressId = req.query.id;
      const from = req.query.from;

      const addressDoc = await Address.findOne({ userId, "address._id": addressId }).lean();
      if (!addressDoc) {
          return res.redirect('/userAddress?message=Address not found');
      }

      const addressData = addressDoc.address.find(addr => addr._id.toString() === addressId);
      if (!addressData) {
          return res.redirect('/userAddress?message=Address not found');
      }

      res.render('editAddress', { address: addressData, from: from });
  } catch (error) {
      console.error('Error fetching address for edit:', error);
      res.redirect('/pageNotFound');
  }
};

const updateAddress = async (req, res) => {
    try {
      const userId = req.session.user;
      const { addressType,addressId, name, city, landMark, state, pincode, phone_no, altPhone_no } = req.body;
    
  
      
      const existingUser = await Address.findOne({ userId, "address._id": addressId });
      if (!existingUser) {
        return res.json({ status: "failure", message: "Address not found" });
      }
  
      const existingAddress = existingUser.address.find(addr => addr._id.toString() === addressId);
      if (!existingAddress) {
        return res.json({ status: "failure", message: "Address not found" });
      }
  
      
      const isSame =
        existingAddress.name === name &&
        (existingAddress.addressType || "") === (addressType || "") &&
        existingAddress.city === city &&
        existingAddress.landMark === landMark &&
        existingAddress.state === state &&
        existingAddress.pincode === pincode &&
        existingAddress.phone_no === phone_no &&
        existingAddress.altPhone_no === altPhone_no;
  
      if (isSame) {
        return res.json({ status: "failure", message: "No changes detected" });
      }
  
      
      await Address.updateOne(
        { userId, "address._id": addressId },
        {
          $set: {
            "address.$.name": name,
            "address.$.addressType": addressType,
            "address.$.city": city,
            "address.$.landMark": landMark,
            "address.$.state": state,
            "address.$.pincode": pincode,
            "address.$.phone_no": phone_no,
            "address.$.altPhone_no": altPhone_no
          }
        }
      );
  
      res.json({ status: "success", message: "Address updated successfully" });
    } catch (error) {
      console.error("Error updating address:", error);
      res.json({ status: "failure", message: "Error updating address" });
    }
  };
  
  

  // const deleteAddress = async (req, res) => {
  //   try {
  //     const userId = req.session.user;
  //     const { addressId } = req.body;
  //     if (!addressId) {
  //       return res.json({ status: "failure", message: "Address not found" });
  //     }
      
  //     await Address.updateOne(
  //       { userId },
  //       { $pull: { address: { _id: addressId } } }
  //     );
      
  //     res.json({ status: "success", message: "Address deleted successfully" });
  //   } catch (error) {
  //     console.error("Error deleting address:", error);
  //     res.json({ status: "failure", message: "Error deleting address" });
  //   }
  // };
  
  const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        // Get "from" from the request body
        const { addressId, from } = req.body;
        if (!addressId) {
            return res.json({ status: "failure", message: "Address not found" });
        }
      
        await Address.updateOne(
            { userId },
            { $pull: { address: { _id: addressId } } }
        );
      
        if (from === "checkoutPage") {
            res.json({ status: "success", message: "Address deleted successfully", redirectUrl: "/checkoutPage" });
        } else {
            res.json({ status: "success", message: "Address deleted successfully" });
        }
    } catch (error) {
        console.error("Error deleting address:", error);
        res.json({ status: "failure", message: "Error deleting address" });
    }
};

const userOrders = async (req, res) => {
    try {
      const userId = req.session.user;
      const userData = await User.findById(userId).lean();
      
      const page = parseInt(req.query.page) || 1;  // Get current page from query params
      const limit = 3;  // Maximum 3 orders per page
      const skip = (page - 1) * limit;
  
      const orders = await Order.find({ user: userId })
        .populate({
          path: 'items.productId',
          model: 'Product', 
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
  
      const totalOrders = await Order.countDocuments({ user: userId });
      const totalPages = Math.ceil(totalOrders / limit);

      function calculateDisplayStatus(items) {
        const statuses = items.map(item => item.status);
        const uniqueStatuses = new Set(statuses);
        if (uniqueStatuses.size === 1) {
          return statuses[0];
        }
        return 'Mixed Status';
      }
      
      orders.forEach(order => {
        order.computedDisplayStatus = calculateDisplayStatus(order.items);
      });
  
      res.render('userOrders', {
        user: userData,
        orders: orders,
        currentPage: page,
        totalPages: totalPages
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.redirect('/pageNotFound');
    }
  };
  

const getReferrals = async (req, res) => {
    try {
        const userId = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        
        const userData = await User.findById(userId).lean();

       
        const redeemedUserIds = userData.redeemedUsers || [];
        const totalReferrals = redeemedUserIds.length;
        const totalPages = Math.ceil(totalReferrals / limit);

      
        const referrals = await User.find({
            _id: { $in: redeemedUserIds }
        })
        .skip(skip)
        .limit(limit)
        .lean();

        res.render('referalPage', {
            user: userData,
            referrals: referrals,
            currentPage: page,
            totalPages: totalPages,
            activeTab: 'referal'
        });
    } catch (error) {
        console.error('Error fetching referrals:', error);
        res.redirect('/pageNotFound');
    }
};

module.exports ={
    userProfile,
    changeEmail,
    changeEmailValid,
    verifyEmail,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassword,
    editProfile,
    updateProfile,
    userAddress,
    addAddressPage,
    addAddress,
    editAddressPage,
    updateAddress,
    deleteAddress,
    userOrders,
    getReferrals
}