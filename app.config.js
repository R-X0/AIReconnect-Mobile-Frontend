// app.config.js
import 'dotenv/config';
import appJson from './app.json';

export default () => ({
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      // Environment variables will override those in app.json if available
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || appJson.expo.extra.OPENAI_API_KEY,
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || appJson.expo.extra.ELEVENLABS_API_KEY,
    },
  },
});
