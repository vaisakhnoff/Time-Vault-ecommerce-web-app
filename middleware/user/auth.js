const User = require('../../models/userschema')





const checkSession = (req, res, next) => {
    const isJsonRequest = req.xhr || 
      (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    if (req.session.user) {
      User.findById(req.session.user)
        .then(data => {
          if (data && !data.isBlocked) {
            console.log("Data", data);
            next();
          } else {
           
            req.session.destroy(err => {
              if (err) {
                console.error("Session destruction error:", err);
              }
              if (isJsonRequest) {
                return res.status(401).json({ success: false, message: "User not authenticated", redirect: "/login" });
              }
              return res.redirect('/login');
            });
          }
        })
        .catch(error => {
          console.log("Error in user auth middleware:", error);
          res.status(500).send("Internal server error");
        });
    } else {
      if (isJsonRequest) {
        return res.status(401).json({ success: false, message: "User not authenticated", redirect: "/login" });
      }
      res.redirect('/login');
    }
  };
  



module.exports={
    
    checkSession
}