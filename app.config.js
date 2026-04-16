module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
  ios: {
    ...config.ios,
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    },
    infoPlist: {
      ...config.ios?.infoPlist,
      NSLocationWhenInUseUsageDescription:
        'This app displays your route on a map. Location is not tracked or stored.',
    },
  },
});
