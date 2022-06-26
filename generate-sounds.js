const speech = require("@google-cloud/speech");
const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const util = require("util"); // import util
const exec = util.promisify(require("child_process").exec); // exec

const gcpStorage = new Storage({
  projectId: process.env.PROJECT_ID,
  keyFilename: process.env.KEY_FILE,
});

async function main() {
  const argvs = process.argv.slice(2);
  const originalAudioName = argvs[0].slice(0, -4); // example
  const originalAudioPath = __dirname + `\\${argvs[0]}`; // example.mp3
  const audioPath = `./${originalAudioName}/audio`;
  const debugPath = `./${originalAudioName}/debug`;
  const wordsPath = `./${originalAudioName}/words`;

  if (!fs.existsSync(audioPath)) {
    fs.mkdirSync(audioPath, { recursive: true });
  }

  if (!fs.existsSync(debugPath)) {
    fs.mkdirSync(debugPath, { recursive: true });
  }

  if (!fs.existsSync(wordsPath)) {
    fs.mkdirSync(wordsPath, { recursive: true });
  }

  console.log("CREATED FOLDER");

  const newOriginalAudioPath = `${audioPath}/${originalAudioName}.wav`; // example.wav

  // Convert mp3 to wav with mono channel
  await exec(
    `ffmpeg -i ${originalAudioPath} -af "atempo=0.7" -ac 1 -y ${newOriginalAudioPath}`
  );
  console.log("CONVERTED TO WAV");

  const bucketURL = "gs://ruhacks";

  // Upload new wav file to GCP bucket
  await gcpStorage.bucket(bucketURL).upload(newOriginalAudioPath, {
    destination: `${originalAudioName}.wav`,
  });

  console.log("UPLOADED TO STORAGE");

  // Perform Word Timestamp
  const client = new speech.SpeechClient({
    projectId: "persisbot-iddv",
    keyFilename: "persisbot-iddv-1ad22d657e1f.json",
  });

  const audio = {
    uri: `${bucketURL}/${originalAudioName}.wav`,
  };

  const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 48000,
    languageCode: "en-GB",
    enableWordTimeOffsets: true,
  };

  const request = {
    audio: audio,
    config: config,
  };

  const [operation] = await client.longRunningRecognize(request);

  console.log("GETTING TIMESTAMP");
  const [response] = await operation.promise();
  console.log("SUCCESS");

  fs.writeFileSync(`${debugPath}/debug.json`, JSON.stringify(response));
  console.log("SAVED DEBUG.JSON");

  var wordFrequency = {};

  response.results.forEach((result) => {
    result.alternatives[0].words.forEach(async (wordInfo) => {
      if (wordFrequency.hasOwnProperty(wordInfo.word)) {
        wordFrequency[wordInfo.word]++;
      } else {
        wordFrequency[wordInfo.word] = 0;
      }

      let startTimeNanos = wordInfo.startTime.nanos / 100000000;
      let endTimeNanos = wordInfo.endTime.nanos / 100000000;

      let startSecs = `${wordInfo.startTime.seconds}.${startTimeNanos}`;
      let endSecs = `${wordInfo.endTime.seconds}.${endTimeNanos}`;

      const wordFolder = `${wordsPath}/${wordInfo.word}`;

      if (!fs.existsSync(wordFolder)) {
        fs.mkdirSync(wordFolder, { recursive: true });
      }

      const outputAudio = `${wordFolder}/${wordInfo.word}-${
        wordFrequency[wordInfo.word]
      }.wav`;

      await exec(
        `ffmpeg -i ${originalAudioPath} -ss ${startSecs} -to ${endSecs} -c:v copy -ac 1 ${outputAudio}`
      );
    });
  });
  console.log("ENDING");
  process.exit(1);
}

main().catch(console.error);
