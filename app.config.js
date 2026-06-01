const packageJson = require("./package.json");

const version = packageJson.version;

function getBuildNumber() {
  if (process.env.APP_BUILD_NUMBER) return process.env.APP_BUILD_NUMBER;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// Android versionCode must be a positive 32-bit integer.
// Minutes since 2024-01-01 gives ~4,000 years of headroom.
function getVersionCode() {
  if (process.env.APP_BUILD_NUMBER) return parseInt(process.env.APP_BUILD_NUMBER, 10);
  const epoch = new Date("2024-01-01T00:00:00Z").getTime();
  return Math.floor((Date.now() - epoch) / 60_000);
}

const buildNumber = getBuildNumber();
const versionCode = getVersionCode();

module.exports = {
  expo: {
    name: "Current",
    slug: "current",
    version,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "current",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.brannonglover.current",
      buildNumber,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.brannonglover.current",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      versionCode,
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-dev-client",
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: "#FAF9F7",
        },
      ],
      "expo-secure-store",
      [
        "expo-notifications",
        {
          color: "#E85D4C",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
