const express = require("express");
const router = express.Router();
const { Storage } = require("@google-cloud/storage");
const speech = require("@google-cloud/speech");
const fs = require("fs");
const fsExtra = require("fs-extra");
const multer = require("multer");
const { getVideoDurationInSeconds } = require("get-video-duration");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

//CockroachDB
const Pool = require("pg").Pool;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

const gcpStorage = new Storage({
  projectId: "sunlit-theory-351023",
  keyFilename: "./credentials/sunlit-theory-351023-08460d392cea.json",
});

const transcribeAudioAPI = async (audioName) => {
  const bucketURL = "gs://gryph-hack-2022-ee";

  const client = new speech.SpeechClient({
    projectId: "sunlit-theory-351023",
    keyFilename: "./credentials/sunlit-theory-351023-08460d392cea.json",
  });

  const encoding = "LINEAR16";
  const languageCode = "en-US";

  const config = {
    enableWordTimeOffsets: true,
    encoding: encoding,
    languageCode: languageCode,
  };

  const audio = {
    uri: bucketURL + "/" + audioName,
  };

  const request = {
    config: config,
    audio: audio,
  };

  const [operation] = await client.longRunningRecognize(request);

  console.log("Getting results ...");

  // Get a Promise representation of the final result of the job
  const [response] = await operation.promise();

  return response.results && response.results.length
    ? response.results[0]
    : undefined;
};

// ROUTE START HERE
router.post("/upload-video", upload.single("my-video"), async (req, res) => {
  const { sessionId } = req.query;
  const bucketURL = "gs://gryph-hack-2022-ee";
  try {
    // Uploading video to GCP bucket
    const uploadedBuffer = await fs.promises.readFile(req.file.path);

    const timestamp = Date.now();
    const newVideoName = `${timestamp}-screen-record.mp4`;
    const newVideoPath = __dirname + `/../uploads/${newVideoName}`;

    await fs.promises.writeFile(newVideoPath, uploadedBuffer, {});

    const audioName = `${timestamp}-audio.wav`;
    const outputAudioPath = __dirname + `/../uploads/${audioName}`;

    await exec(`ffmpeg -i ${newVideoPath} -ac 1 ${outputAudioPath}`);

    // Upload full video
    await gcpStorage.bucket(bucketURL).upload(newVideoPath, {
      destination: newVideoName,
    });

    // Upload full audio
    await gcpStorage.bucket(bucketURL).upload(outputAudioPath, {
      destination: audioName,
    });

    const videoDuration = await getVideoDurationInSeconds(newVideoPath);

    const videoResults = await pool.query(
      "INSERT INTO videos (session_id, name, transcript, video_order, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [sessionId, newVideoName, audioName, 0, 0, videoDuration]
    );

    console.log(videoResults.rows);

    const timestamps = [
      { start: 0, end: 2 },
      { start: 5, end: 8 },
      { start: 10, end: 16 },
    ];

    await Promise.all(
      timestamps.map(async (timeStamp, index) => {
        const start_trim = new Date(timeStamp.start * 1000)
          .toISOString()
          .slice(11, 19);
        const end_trim = new Date(timeStamp.end * 1000)
          .toISOString()
          .slice(11, 19);

        // trim audio
        const trimAudio = `${timestamp}-screen-record-${index + 1}.wav`;
        const trimAudioPath = __dirname + `/../uploads/${trimAudio}`;
        // trim videos
        const trimVideo = `${timestamp}-screen-record-${index + 1}.mp4`;
        const trimVideoPath = __dirname + `/../uploads/${trimVideo}`;

        // trim thumbnail
        const trimVideoThumbnail = `${timestamp}-screen-record-${
          index + 1
        }.jpg`;
        const trimVideoThumbnailPath =
          __dirname + `/../uploads/${trimVideoThumbnail}`;

        // GENERATE TRIM AUDIO
        await exec(
          `ffmpeg -i ${newVideoPath} -ss ${start_trim} -to ${end_trim} -c:v copy -ac 1 ${trimAudioPath}`
        );

        // GENERATE TRIM VIDEO
        await exec(
          `ffmpeg -i ${newVideoPath} -ss ${start_trim} -to ${end_trim} -c copy ${trimVideoPath}`
        );

        // GENERATE THUMBNAIL
        await exec(
          `ffmpeg -ss ${start_trim} -i ${newVideoPath} -vframes 1 ${trimVideoThumbnailPath}`
        );

        await gcpStorage.bucket(bucketURL).upload(trimAudioPath, {
          destination: trimAudio,
        });
        await gcpStorage.bucket(bucketURL).upload(trimAudioPath, {
          destination: trimVideo,
        });

        const transcriptResult = await transcribeAudioAPI(trimAudio);

        // IF TRANSCRIPT SUCCESSFULLY
        if (transcriptResult) {
          // Upload thumbnail
          await gcpStorage.bucket(bucketURL).upload(trimVideoThumbnailPath, {
            destination: trimVideoThumbnail,
          });

          console.log(
            `Transcription: ${transcriptResult.alternatives[0].transcript}`
          );

          const videoResults = await pool.query(
            "INSERT INTO videos (session_id, name, transcript, video_order, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [
              sessionId,
              trimVideoThumbnail,
              transcriptResult.alternatives[0].transcript,
              index + 1,
              timeStamp.start,
              timeStamp.end,
            ]
          );

          console.log(videoResults.rows);
        } else {
          await gcpStorage.bucket(bucketURL).file(trimAudio).delete();
          await gcpStorage.bucket(bucketURL).file(trimVideo).delete();
        }
      })
    );

    fsExtra.emptyDirSync("uploads");
    res.status(200).send({ res: "Done transcription" });
  } catch (error) {
    console.log(error);
  }
});

router.get("/", (req, res) => {
  pool.query("SELECT * FROM sessions", (error, results) => {
    if (error) {
      throw error;
    }
    res.status(200).send(results.rows);
  });
});

router.get("/data/:session_id", (req, res) => {
  const session_id = req.params.session_id || "";

  pool.query(
    "SELECT * FROM sessions WHERE id = $1",
    [session_id.toString()],
    (error, results) => {
      if (error) {
        throw error;
      }
      res.status(200).send(results.rows);
    }
  );
});

// GET SESSIONS FROM USER ID
router.get("/:user_id", (req, res) => {
  const user_id = req.params.user_id || "";

  pool.query(
    "SELECT * FROM sessions WHERE user_id = $1",
    [user_id.toString()],
    (error, results) => {
      if (error) {
        throw error;
      }
      res.status(200).send(results.rows);
    }
  );
});

// GET VIDEOS FROM SESSION ID
router.get("/videos/:session_id", (req, res) => {
  const session_id = req.params.session_id || "";

  pool.query(
    "SELECT * FROM videos WHERE session_id = $1 ORDER BY video_order",
    [session_id.toString()],
    (error, results) => {
      if (error) {
        throw error;
      }
      res.status(200).send(results.rows);
    }
  );
});

// CREATE SESSION
router.post("/", async (req, res) => {
  const { user_id, session_name } = req.body;
  try {
    const results = await pool.query(
      "INSERT INTO sessions (user_id , name) VALUES ($1, $2) RETURNING *",
      [user_id, session_name]
    );

    res.status(200).send(results.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(404).send(error);
  }
});

// DELETE SESSIONs
router.post("/delete", async (req, res) => {
  const { session_id } = req.body;
  try {
    await pool.query("DELETE FROM videos WHERE session_id = $1", [
      (session_id || "").toString(),
    ]);

    const results = await pool.query("DELETE FROM sessions WHERE id = $1", [
      (session_id || "").toString(),
    ]);

    res.status(200).send(results.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(404).send(error);
  }
});

module.exports = router;
