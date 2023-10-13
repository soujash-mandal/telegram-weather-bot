const telegrambot = require("node-telegram-bot-api");
const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const logger = require("morgan");
const path = require("path");
const router = require("./routes/index");
const { auth } = require("express-openid-connect");
const { default: mongoose } = require("mongoose");
const schedule = require("node-schedule");

// import
const generateWeatherMessage = require("./tasks/userMessage");
const { getNameByCode } = require("./tasks/weatherMessageFormatter");
const { default: axios } = require("axios");
const subscriber = require("./models/subscriber");

dotenv.load();

const app = express();

const apiKey = process.env.WEATHER_API_KEY;
const token = process.env.TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new telegrambot(token, { polling: true });

// connect to MongoDB
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("mongoDB Connected!"));

// Two Type Of bot messages input has been handled
bot.on("message", handleMessage);
bot.on("location", handleLocation);
// Schedule the job to run daily at a specific time (e.g., 12:00 PM)
const job = schedule.scheduleJob({ hour: 8, minute: 30 }, sendDailyMessages);

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const config = {
  authRequired: false,
  auth0Logout: true,
};

const port = process.env.PORT || 3000;
if (
  !config.baseURL &&
  !process.env.BASE_URL &&
  process.env.PORT &&
  process.env.NODE_ENV !== "production"
) {
  config.baseURL = `http://localhost:${port}`;
}

app.use(auth(config));

// Middleware to make the `user` object available for all views
app.use(function (req, res, next) {
  res.locals.user = req.oidc.user;
  next();
});

// Route to handle blocking a user
app.post("/block-user", async (req, res) => {
  const { chatId } = req.body;

  try {
    // Find the subscriber by chatId and update the blocked status
    const Subs = await subscriber.findOne({ chatId: chatId });

    if (Subs) {
      Subs.blocked = true;
      await Subs.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Error occurred while blocking user." });
  }
});
app.post("/delete-user", async (req, res) => {
  const { chatId } = req.body;

  try {
    // Find the subscriber by chatId and delete the user
    const Subs = await subscriber.deleteOne({ chatId: chatId });

    if (Subs) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Error occurred while deleting user." });
  }
});

app.use("/", router);

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// Error handlers
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render("error", {
    message: err.message,
    error: process.env.NODE_ENV !== "production" ? err : {},
  });
});

app.listen(port, () => console.log("listening on port " + port));

// Function to send daily messages to users
async function sendDailyMessages() {
  try {
    // Retrieve user data from the database
    const users = await subscriber.find({});
    users.map(async (user) => {
      console.log(user);
      // bot.sendMessage(user.chatId, `Good Morning, ${user.name} `);
      const coordsApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${user.lat}&lon=${user.lon}&appid=${apiKey}`;
      const coordsCityUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${user.lat}&lon=${user.lon}&appid=${apiKey}`;
      // bot.sendMessage(user.chatId, coordsApiUrl);
      try {
        const response = await axios.get(coordsApiUrl);
        const jsonData = response.data;

        const cityResponse = await axios.get(coordsCityUrl);
        const cityJsonData = cityResponse.data;

        const weatherMessage = generateWeatherMessage(
          jsonData,
          cityJsonData,
          "message"
        );

        // Use the HTML parse_mode option to format the message as HTML
        bot.sendMessage(user.chatId, weatherMessage, {
          parse_mode: "Markdown",
        });
        console.log(weatherMessage);
      } catch (error) {
        console.log("failed to send daily update");
      }
    });
  } catch (error) {
    console.error("Error sending daily messages:", error.message);
  }
}

async function handleLocation(msg) {
  let lat = msg.location.latitude;
  let lon = msg.location.longitude;

  let chat_id = msg.from.id;

  console.log(lat, lon);
  const coordsApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`;
  const coordsCityUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&appid=${apiKey}`;
  try {
    const response = await axios.get(coordsApiUrl);
    // Extract the data from the response
    const jsonData = response.data;

    const cityResponse = await axios.get(coordsCityUrl);
    const cityJsonData = cityResponse.data;

    // Send a bold message
    const weatherMessage = generateWeatherMessage(
      jsonData,
      cityJsonData,
      "location"
    );

    // Use the HTML parse_mode option to format the message as HTML
    bot.sendMessage(chat_id, weatherMessage, { parse_mode: "Markdown" });
    console.log(weatherMessage);
    try {
      // Remove the user by chatId
      const result = await subscriber.deleteOne({ chatId: chat_id });
      const newSubscriber = new subscriber({
        chatId: chat_id,
        name: msg.from.first_name + " " + msg.from.last_name,
        username: msg.from.username,
        lat: jsonData.coord.lat,
        lon: jsonData.coord.lon,
        location:
          jsonData.name +
          " - " +
          cityJsonData[0].state +
          ", " +
          getNameByCode(cityJsonData[0].country),
      });
      console.log(newSubscriber);
      // Save the user to the database
      const savedUser = await newSubscriber.save();
      console.log("User saved:", savedUser);
    } catch (error) {
      console.log("error creating subscriber 2 " + error.message);
    }
  } catch (error) {
    let errorMessage = "City Not Found";
    console.error(errorMessage);
    // bot.sendMessage(chat_id, errorMessage);
  }
}

async function handleMessage(msg) {
  // console.log(msg);
  if (!msg.text) {
    return;
  }
  let chat_id = msg.from.id;
  console.log(msg.text + " - " + chat_id);
  if (msg.text == "/start") {
    const welcomeMsg = `
    *Welcome to Daily Weather 🌤️*

    📌 share your *location* 📌
    to get Daily weather information
    
    Also you can get other city
    weathers by texting city name
    `;
    bot.sendMessage(chat_id, welcomeMsg, { parse_mode: "Markdown" });
    return;
  }

  let city = msg.text;
  const coordsCityUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${city}&appid=${apiKey}`;
  try {
    const cityResponse = await axios.get(coordsCityUrl);
    const cityJsonData = cityResponse.data;

    const cityApiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${cityJsonData[0].name}&appid=${apiKey}`;
    const response = await axios.get(cityApiUrl);
    // Extract the data from the response
    const jsonData = response.data;

    console.log(jsonData.weather[0].main);
    // Send a bold message
    const weatherMessage = generateWeatherMessage(
      jsonData,
      cityJsonData,
      "message"
    );
    // Use the HTML parse_mode option to format the message as HTML
    bot.sendMessage(chat_id, weatherMessage, { parse_mode: "Markdown" });
    console.log(weatherMessage);
  } catch (error) {
    let errorMessage = "City Not Found";
    console.error(errorMessage);
    // bot.sendMessage(chat_id, errorMessage);
  }
}