const speech = require("@google-cloud/speech");
const fs = require("fs");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

async function main() {
  const client = new speech.SpeechClient({
    projectId: process.env.apikey,
    keyFilename: process.env.apikey2lol,
  });

  const audio = {
    uri: process.env.uri,
  };
  const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 16000,
    languageCode: "en-GB",
    enableWordTimeOffsets: true,
  };

  const request = {
    audio: audio,
    config: config,
  };

  const [operation] = await client.longRunningRecognize(request);
  console.log("Getting results ...");
  const [response] = await operation.promise();

  response.results.forEach((result) => {
    result.alternatives[0].words.forEach(async (wordInfo) => {

        let startTimeNanos = wordInfo.startTime.nanos/ 100000000;
        let endTimeNanos = wordInfo.endTime.nanos/ 100000000;
        if(endTimeNanos-startTimeNanos < .2 && wordInfo.startTime.seconds!=0){
           startTimeNanos -= .2
           endTimeNanos += .2
        }
     const startSecs = `${wordInfo.startTime.seconds}.${
        startTimeNanos
      }`;
      // End time of the word in sec
      const endSecs = `${wordInfo.endTime.seconds}.${
        endTimeNanos
      }`;
      const outputAudio = __dirname + `\\resources\\${wordInfo.word}.wav`;
      const inputAudio = __dirname + `\\resources\\audioone.wav`;
      console.log(`Word: ${wordInfo.word}`);
      console.log(`\t ${startSecs} secs - ${endSecs} secs`);
      await exec(
        `ffmpeg -i ${inputAudio} -ss ${startSecs + 1} -to ${endSecs + 1} -c:v copy -ac 1 ${outputAudio}`
      );
    });
  });
}

main().catch(console.error);