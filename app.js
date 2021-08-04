const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");

let database = null;

const app = express();
app.use(express.json());

const initializeDbWithServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB error : ${e.message}`);
    process.exit(1);
  }
};

initializeDbWithServer();

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Register API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userInfo = await database.run(selectUserQuery);
  if (userInfo === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user (username, password, name, gender)
            VALUES 
                (
                    '${username}',
                    '${hashedPassword}',
                    '${name}',
                    '${gender}'
                );`;
      await database.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

// Twitter Feed API

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getTweetsQuery = `SELECT user.user_name, tweet.tweet, tweet.date_time  FROM tweet  INNER JOIN follower ON tweet.user_id = follower.follower_user_id INNER JOIN
    user ON dbUser.user_id = tweet.user_id
    WHERE user.username = '${username}'
    ORDER BY tweet.date_time;
    LIMIT 4;
    `;
  const tweets = await database.all(getTweetsQuery);
  response.send([tweets]);
});

//User following info API

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getFollowingQuery = `SELECT user.username FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE follower.following_user_id = user.user_id && user.username = '${username}';`;
  const following = await database.all(getFollowingQuery);
  response.send([following]);
});

//Followers API

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getFollowersQuery = `SELECT user.username FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}' && follower.following_user_id = user.user_id;`;
  const followers = await database.all(getFollowersQuery);
  response.send([followers]);
});

//Get Tweet API

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  const tweetId = request.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await database.get(selectUserQuery);

  const getTweetDetailsQuery = `SELECT FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply tweet.tweet_id = reply.tweet_id
  WHERE tweet.tweet_id = '${tweetId}'`;
});

module.exports = app;
