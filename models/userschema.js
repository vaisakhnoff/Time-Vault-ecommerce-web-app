const { name } = require('ejs');
const mongoose = require('mongoose');
const {Schema} = mongoose;

function generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

const userschema =  new Schema({
    firstName: {
        type : String,
        required : true
    },
    lastName:{
        type : String,
        required : true
    }
    ,email:{
        type : String,
        required : true,
        unique : true
    },
    phoneNumber:{
        type : Number,
        required : false,
        unique :  true,
        sparse : true
      },
      googleId:{
        type : String,
        required : false,
        unique : true,
        sparse : true
      },
      password:{
        type : String,
        required : false
      },
      isBlocked:{
        type : Boolean,
        default:false
      },
      isAdmin:{
        type:Boolean,
        default:false
      },
      // cart:[{
      //   type:Schema.Types.ObjectId,
      //   ref:'cart'
      // }],
      wallet:{
        type:Number,
        default:0
      },
      // wishlist:[{
      //   type:Schema.Types.ObjectId,
      //   ref:'wishlist'
      // }],
      orderHistory:{
        type:Schema.Types.ObjectId,
        ref:'order'

      },
      createdOn:{
        type:Date,
        default:Date.now
      },
      referalCode: {
        type: String,
        unique: true,
        sparse: true
      },
      
      redeemed:{
        type:Boolean,
        // default:false 
        
      },
      redeemedUsers:[{
        type:Schema.Types.ObjectId,
        ref:'user',
        // required:true
      }],
      searchHistory:[{
        category:{
            type:Schema.Types.ObjectId,
            ref:'category'
        }
      }],
      brand:{
        type:String
      },
      searchOn:{
        type:Date,
        default:Date.now
      },
      profileImage: {
        type: String,
        default: '/uploads/profile/default-profile.png' 
    }



},{ timestamps: true })

const user = mongoose.model('user',userschema);

module.exports = user;