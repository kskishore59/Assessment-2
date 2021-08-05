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

const validatePassword = (password) => {
  return password.length > 5;
};

const convertDbObjectToJson = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const convertNameToJson = (dbObject) => {
  return dbObject.name;
};

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
    const createUserQuery = `INSERT INTO user (username, password, name, gender)
            VALUES 
                (
                    '${username}',
                    '${hashedPassword}',
                    '${name}',
                    '${gender}'
                );`;
    if (password.length > 5) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Twitter Feed API

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getTweetsQuery = `SELECT *  FROM tweet  INNER JOIN follower ON tweet.user_id = follower.follower_user_id INNER JOIN
    user ON user.user_id = tweet.user_id
    WHERE follower.following_user_id IN (SELECT follower.following_user_id FROM follower WHERE follower.follower_user_id = '${dbUser.user_id}')
    ORDER BY tweet.date_time DESC;
    LIMIT 4;
    `;
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets.map((each) => convertDbObjectToJson(each)));
});

//User following info API

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getFollowingQuery = `SELECT user.name FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE follower.following_user_id IN (SELECT follower.following_user_id FROM follower WHERE follower.follower_user_id = '${dbUser.user_id}');`;
  const following = await database.all(getFollowingQuery);
  response.send(following);
});

//Followers API

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getFollowersQuery = `SELECT user.username FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id IN (SELECT follower.following_user_id FROM follower WHERE follower.follower_user_id = '${dbUser.user_id}')`;
  const followers = await database.all(getFollowersQuery);
  response.send(followers);
});

//Get Tweet API

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const validRequestQuery = `SELECT * FROM tweet INNER JOIN follower ON follower.following_user_id = tweet.user_id
  WHERE  tweet.tweet_id = ${tweetId} AND follower.following_user_id IN (SELECT follower.following_user_id FROM follower WHERE follower.follower_user_id = '${dbUser.user_id}')`;
  const validRequest = await database.get(validRequestQuery);
  const validate = { tweetId: validRequest.tweet_id };
  if (validate.tweetId === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetQuery = `SELECT tweet.tweet, COUNT(like.tweet_id) AS likes, COUNT(reply.tweet_id) AS replies, tweet.date_time FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ${tweetId};`;
    const tweet = await database.all(getTweetQuery);
    response.send(tweet);
  }
});

//GET Likes of Tweets API

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const validRequestQuery = `SELECT * FROM tweet INNER JOIN follower ON follower.following_user_id = tweet.user_id
  WHERE  tweet.tweet_id = ${tweetId} AND follower.following_user_id IN (SELECT follower.following_user_id FROM follower WHERE follower.follower_user_id = '${dbUser.user_id}')`;
    const validRequest = await database.get(validRequestQuery);
    const validate = { tweetId: validRequest.tweet_id };
    if (validate.tweetId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikesQuery = `SELECT user.name FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.user_id = user.user_id
    WHERE like.tweet_id = ${tweetId}`;
      const likedUsers = await database.all(getLikesQuery);
      response.send({ likes: likedUsers.map((each) => each.name) });
    }
  }
);

//Get replies API
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const validRequestQuery = `SELECT * FROM tweet INNER JOIN follower ON follower.following_user_id = tweet.user_id
  WHERE  tweet.tweet_id = ${tweetId} AND follower.following_user_id IN (SELECT follower.following_user_id FROM follower WHERE follower.follower_user_id = '${dbUser.user_id}')`;
    const validRequest = await database.get(validRequestQuery);
    const validate = { tweetId: validRequest.tweet_id };
    if (validate.tweetId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const replyTweetQuery = `SELECT user.name, reply.reply FROM user INNER JOIN reply ON user.user_id = reply.user_id
        WHERE reply.tweet_id = ${tweetId}`;
      const reply = await database.all(replyTweetQuery);
      response.send({ replies: reply });
    }
  }
);

//Get All Tweets API
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getAllTweetsQuery = `SELECT *, COUNT(like.tweet_id) AS likes, COUNT(reply.tweet_id) AS replies FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id INNER JOIN like ON like.tweet_id = tweet.tweet_id WHERE tweet.user_id = '${dbUser.user_id}'`;
  const tweets = await database.all(getAllTweetsQuery);
  response.send(tweets);
});

//Create tweet API
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const createTweetQuery = `INSERT INTO tweet 
  VALUES (
      tweet = '${tweet}',
      user_id = '${dbUser.user_id}',
      date_time = Date.now();
  )`;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet API
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = '${dbUser.user_id}'`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
