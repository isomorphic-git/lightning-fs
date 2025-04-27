// Karma configuration
process.env.CHROME_BIN = require('puppeteer').executablePath()
const path = require('path')
const webpack = require('webpack')

const REPO = process.env.BUILD_REPOSITORY_NAME
const ISSUE =
  process.env.SYSTEM_PULLREQUEST_PULLREQUESTNUMBER ||
  process.env.SYSTEM_PULLREQUEST_PULLREQUESTID
const COMMIT = process.env.BUILD_SOURCEVERSION

module.exports = function (config) {
  const options = {
    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: [],
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',
    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],
    // list of files / patterns to load in the browser
    files: [
      'src/**/*.spec.js',
      {
        pattern: 'src/__tests__/__fixtures__/test-folder/**/*',
        served: true,
        watched: false,
        included: false
      },
      {
        pattern: 'src/__tests__/__fixtures__/test-folder/**/.*',
        served: true,
        watched: false,
        included: false
      },
      {
        pattern: 'src/**/*.worker.js',
        served: true,
        watched: true,
        included: false
      },
      {
        pattern: 'dist/**',
        served: true,
        watched: true,
        included: false
      },
    ],
    // list of files to exclude
    // exclude: [
    //   '**/node_modules/**',
    // ],
    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'src/**/*.spec.js': ['webpack']
    },
    // web server port
    port: 9876,
    // enable / disable colors in the output (reporters and logs)
    colors: true,
    // Increase timeouts since some actions take quite a while.
    browserNoActivityTimeout: 4 * 60 * 1000, // default 10000
    // https://support.saucelabs.com/hc/en-us/articles/225104707-Karma-Tests-Disconnect-Particularly-When-Running-Tests-on-Safari
    browserDisconnectTimeout: 10000, // default 2000
    browserDisconnectTolerance: 0, // default 0
    captureTimeout: 4 * 60 * 1000, // default 60000
    // SauceLabs browsers
    customLaunchers: {
      XXXsl_chrome: {
        base: 'SauceLabs',
        browserName: 'chrome',
        extendedDebugging: true,
      },
      XXXsl_firefox: {
        base: 'SauceLabs',
        browserName: 'firefox',
      },
      sl_edge: {
        base: 'SauceLabs',
        browserName: 'MicrosoftEdge',
        version: '79.0',
      },
      sl_safari: {
        base: 'SauceLabs',
        browserName: 'safari',
        platform: 'macOS 11.00',
        version: '14',
      },
      sl_ios_safari: {
        base: 'SauceLabs',
        deviceName: 'iPhone 11 Pro Max Simulator',
        platformName: 'iOS',
        platformVersion: '14.0',
        browserName: 'Safari',
        appiumVersion: '1.18.3',
      },
      XXXsl_android_chrome: {
        base: 'SauceLabs',
        deviceOrientation: 'portrait',
        deviceName: 'Android GoogleAPI Emulator',
        platformName: 'Android',
        platformVersion: '7.1',
        browserName: 'Chrome',
        appiumVersion: '1.15.0',
      },
      bs_android_chrome: {
        base: 'BrowserStack',
        os: 'android',
        os_version: '10.0',
        browser: 'android',
        device: 'Google Pixel 4',
        real_mobile: true,
      },
      FirefoxHeadless: {
        base: 'Firefox',
        flags: ['-headless'],
      },
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
      ChromeCanaryHeadlessNoSandbox: {
        base: 'ChromeCanaryHeadless',
        flags: ['--no-sandbox'],
      },
    },
    sauceLabs: {
      // Since tags aren't being sent correctly, I'm going to stick the branch name in here.
      testName: `${REPO} / ${ISSUE} / ${COMMIT}`,
      // Note: I added the Date.now() bit so that when I can click "Restart" on a Travis job,
      // Sauce Labs does not simply append new test results to the old set that failed, which
      // convinces karma that it failed again and always.
      build: process.env.BUILD_BUILDID + '-' + Date.now(),
      // Note: it does not appear that tags are being sent correctly.
      tags: [ISSUE],
      recordScreenshots: false,
      recordVideo: false,
      public: 'public restricted',
    },
    concurrency: 5,
    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,
    // test results reporter to use
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['verbose', 'junit'],
    junitReporter: {
      outputDir: './junit'
    },
    webpack: {
      mode: 'development',
      devtool: 'inline-source-map',
    },
    plugins: [
      'karma-browserstack-launcher',
      'karma-chrome-launcher',
      'karma-edge-launcher',
      'karma-ie-launcher',
      'karma-safari-launcher',
      'karma-firefox-launcher',
      'karma-jasmine',
      'karma-junit-reporter',
      'karma-sauce-launcher',
      'karma-verbose-reporter',
      'karma-webpack',
    ]
  }

  if (!process.env.SAUCE_USERNAME) {
    console.log(
      'Skipping SauceLabs tests because SAUCE_USERNAME environment variable is not set.'
    )
  } else if (!process.env.SAUCE_ACCESS_KEY) {
    console.log(
      'Skipping SauceLabs tests because SAUCE_ACCESS_KEY environment variable is not set.'
    )
  } else {
    options.reporters.push('saucelabs')
  }

  if (process.env.TEST_BROWSERS) {
    options.browsers = process.env.TEST_BROWSERS.split(',')
  } else {
    options.browsers.push('ChromeHeadlessNoSandbox')
    options.browsers.push('FirefoxHeadless')
  }

  console.log('running with browsers:', options.browsers)

  if (!process.env.CI) {
    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    options.singleRun = false
    // enable / disable watching file and executing tests whenever any file changes
    options.autoWatch = true
  }

  config.set(options)
}
