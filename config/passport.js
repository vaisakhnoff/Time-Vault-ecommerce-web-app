const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userschema");
require('dotenv').config();


function generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: (process.env.BASE_URL || "http://localhost:3000") + "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
     
      if (!profile.emails || profile.emails.length === 0) {
        return done(new Error("No email found in the Google profile"), null);
      }
      
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
       
        if (user.isBlocked) {
          return done(null, false, { message: "User is blocked by admin" });
        }
        return done(null, user);
      } else {
       
        const nameParts = profile.displayName ? profile.displayName.split(" ") : [];
        const firstName = nameParts[0] || "";
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

        let newReferralCode;
        let isUnique = false;
        while (!isUnique) {
            newReferralCode = generateReferralCode();
            const existingUser = await User.findOne({ referalCode: newReferralCode });
            if (!existingUser) {
                isUnique = true;
            }
        }

        
        user = new User({
          firstName: firstName,
          lastName: lastName,
          email: profile.emails[0].value,
          googleId: profile.id,
          referalCode: newReferralCode
        });
        await user.save();
        return done(null, user);
      }
    } catch (error) {
      return done(error, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => done(null, user))
    .catch(err => done(err, null));
});

module.exports = passport;
