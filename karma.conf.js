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
    // Remote (BrowserStack) browsers can be slow to report activity; avoid flaky disconnects.
    browserDisconnectTimeout: 10000, // default 2000
    browserDisconnectTolerance: 0, // default 0
    captureTimeout: 4 * 60 * 1000, // default 60000
    // BrowserStack browsers
    customLaunchers: {
      bs_edge: {
        base: 'BrowserStack',
        browser: 'edge',
        browser_version: '110.0',
        os: 'Windows',
        os_version: '11',
      },
      bs_safari: {
        base: 'BrowserStack',
        browser: 'safari',
        browser_version: '16.0',
        os: 'OS X',
        os_version: 'Ventura',
      },
      bs_ios_safari: {
        base: 'BrowserStack',
        device: 'iPhone 14',
        os: 'ios',
        os_version: '16',
        real_mobile: true,
      },
      bs_android_chrome: {
        base: 'BrowserStack',
        os: 'android',
        os_version: '12.0',
        browser: 'android',
        device: 'Google Pixel 6',
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
    browserStack: {
      // Explicit project/build names so each run is identifiable in the
      // BrowserStack dashboard, mirroring the naming used to previously
      // identify SauceLabs runs.
      project: REPO || 'lightning-fs',
      build: `${ISSUE} / ${COMMIT} / ${process.env.BUILD_BUILDID}-${Date.now()}`,
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
      'karma-verbose-reporter',
      'karma-webpack',
    ]
  }

  if (!process.env.BROWSER_STACK_USERNAME) {
    console.log(
      'Skipping BrowserStack tests because BROWSER_STACK_USERNAME environment variable is not set.'
    )
  } else if (!process.env.BROWSER_STACK_ACCESS_KEY) {
    console.log(
      'Skipping BrowserStack tests because BROWSER_STACK_ACCESS_KEY environment variable is not set.'
    )
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
