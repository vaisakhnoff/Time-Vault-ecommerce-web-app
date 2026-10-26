const express = require('express');
const app = express();

app.set('trust proxy', 1);

const path =require('path');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter') 
const env = require('dotenv').config();
const passport = require('./config/passport')
const session = require('express-session');
const db  = require('./config/db');
const nocache=require('nocache')
const compression = require('compression');
const MongoStore = require('connect-mongo');
db();

app.use(compression());

// Serve static assets first so they skip session/nocache and can be cached by the browser
app.use(express.static(path.join(__dirname,'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1h'
}));

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 60*60*24
    }),
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:1000*60*60*24
    }
}));




// app.use('/uploads', express.static('uploads'))

app.use(nocache())
app.use(passport.initialize());
app.use(passport.session());

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);

app.use('/',userRouter)
app.use('/admin',adminRouter)

app.use((req, res, next) => {
    res.status(404).render('page-404', { error: 'Page not found' });
});

app.listen(process.env.PORT,()=>{
    console.log("server is running");   
    
});



module.exports = app;
