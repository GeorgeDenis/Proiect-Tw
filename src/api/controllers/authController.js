require("dotenv").config();
const AppError = require("../utils/appError");
const errorController = require("../controllers/errorController");
const parseRequestBody = require("../utils/parseReq");
const catchAsync = require("../utils/catchAsync");
const users = require("../model/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {promisify} = require('util');


const generateToken = (name, email) => {
  let jwtSecretKey = process.env.JWT_SECRET_KEY;
  let data = {
    name: name,
    email: email,
  };
  let options = {
    expiresIn: process.env.EXPIRATION,
  };
  const token = jwt.sign(data, jwtSecretKey, options);
  return token;
};
const verifyToken = catchAsync(async (req, res) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    errorController(
      res,
      new AppError("You are not logged in! Please log in!", 401)
    );
    return null;
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET_KEY);
  
  const freshUser = await users.findUserByUser(decoded.name);

  if (!freshUser) {
    errorController(res, new AppError("The user does not longer exists!", 401));
    return null;
  }
  req.currentUser = freshUser;
  return freshUser;
});

const signup = catchAsync(async (req, res) => {
  const user = await parseRequestBody(req);
  if (!user) {
    errorController(res, new AppError("Please provide a user data", 400));
  }
  if (!user.name || !user.email || !user.password) {
    errorController(res, new AppError("Provide all required fields", 400));
  }
  if (await users.validateUsername(user.name)) {
    errorController(res, new AppError("Name already exists", 400));
    return;
  }
  if (await users.validateEmail(user.email)) {
    errorController(res, new AppError("Email already exists", 400));
    return;
  }
  user.password = await bcrypt.hash(user.password, 10);
  const result = await users.createUser(user);

  let token = generateToken(user.name, user.email);

  const response = {
    status: "success",
    data: {
      token,
    },
  };

  res.statusCode = 201;
  res.end(JSON.stringify(response));
});

const login = catchAsync(async (req, res) => {
  const { email, password } = await parseRequestBody(req);

  if (!email || !password) {
    errorController(res, new AppError("Provide all required fields", 400));
  }

  const user = await users.findUserByEmail(email);
  if (!user) {
    errorController(res, new AppError("Invalid email or password", 401));
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    errorController(res, new AppError("Invalid email or password", 401));
    return;
  }

  let token = generateToken(user.name, user.email);
  const response = {
    status: "success",
    data: {
      token,
    },
  };

  res.statusCode = 201;
  res.end(JSON.stringify(response));
});

const authController = catchAsync(async (req, res) => {
  const { method, url } = req;
  res.setHeader("Content-Type", "application/json");
  if (url === "/api/auth/signup" && method === "POST") {
    signup(req, res);
  } else if (url === "/api/auth/login" && method === "POST") {
    login(req, res);
  }
});

module.exports = { authController, verifyToken };