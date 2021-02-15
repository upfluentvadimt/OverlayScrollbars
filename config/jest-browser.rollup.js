const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const del = require('del');
const chalk = require('chalk');
const readline = require('readline');
const rollup = require('rollup');
const rollupPluginHtml = require('@rollup/plugin-html');
const rollupPluginStyles = require('rollup-plugin-styles');
const rollupPluginServe = require('rollup-plugin-serve');
const rollupPluginLivereload = require('rollup-plugin-livereload');
const deploymentConfig = require('./jest-browser.rollup.config.js');

const rollupConfigName = 'rollup.config.js';
const cacheFilePrefix = 'jest-browser-overlayscrollbars-cache-';
const cacheEncoding = 'utf8';
const cacheHash = 'md5';

const rollupAdditionalWatchFiles = (files) => ({
  buildStart() {
    if (files) {
      files.forEach((file) => {
        if (fs.existsSync(file)) {
          this.addWatchFile(file);
        }
      });
    }
  },
});

const makeHtmlAttributes = (attributes) => {
  if (!attributes) {
    return '';
  }

  const keys = Object.keys(attributes);
  // eslint-disable-next-line no-param-reassign
  // eslint-disable-next-line no-return-assign
  return keys.reduce((result, key) => (result += ` ${key}="${attributes[key]}"`), '');
};

const genHtmlTemplateFunc = (contentOrContentFn) => ({ attributes, files, meta, publicPath, title }) => {
  const scripts = (files.js || [])
    .map(({ fileName }) => `<script src="${publicPath}${fileName}"${makeHtmlAttributes(attributes.script)}></script>`)
    .join('\n');

  const links = (files.css || [])
    .map(({ fileName }) => `<link href="${publicPath}${fileName}" rel="stylesheet"${makeHtmlAttributes(attributes.link)}>`)
    .join('\n');

  const metas = meta.map((input) => `<meta${makeHtmlAttributes(input)}>`).join('\n');

  return `<!doctype html>
<html${makeHtmlAttributes(attributes.html)}>
  <head>
    ${metas}
    <title>${title}</title>
    <style>
      html,
      body {
        padding: 0;
        margin: 0;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
      }
      body {
        padding: 10px;
      }
      *::before,
      *::after {
        box-sizing: border-box;
      }
      * {
        box-sizing: inherit;
      }
      #testResult {
        display: none;
        position: fixed;
        top: 0;
        right: 0;
        padding: 5px;
        background: white;
      }
      #testResult.passed {
        display: block;
        background: lime;
      }
      #testResult.passed::before {
        content: 'passed';
      }
      #testResult.failed {
        display: block;
        background: red;
      }
      #testResult.failed::before {
        content: 'failed';
      }
    </style>
    ${links}
  </head>
  <body>
    ${(typeof contentOrContentFn === 'function' ? contentOrContentFn() : contentOrContentFn) || ''}
    ${scripts}
    <div id="testResult"></div>
  </body>
</html>`;
};

const getAllFilesFrom = (dir, except) => {
  const result = [];
  fs.readdirSync(dir).forEach((dirOrFile) => {
    if (!except.includes(dirOrFile)) {
      const dirOrFileResolved = path.resolve(dir, dirOrFile);
      if (fs.statSync(dirOrFileResolved).isDirectory()) {
        result.push(...getAllFilesFrom(dirOrFileResolved));
      }
      result.push(dirOrFileResolved);
    }
  });
  return result;
};

const createCacheObj = (testPath) => {
  const testFileName = path.basename(testPath);
  const testFiles = getAllFilesFrom(path.dirname(testPath), [deploymentConfig.build, testFileName]);
  const obj = {};

  testFiles.forEach((dir) => {
    obj[dir] = crypto.createHash(cacheHash).update(fs.readFileSync(dir, cacheEncoding), cacheEncoding).digest('hex');
  });

  return obj;
};

const filesChanged = (testPath, cacheDir) => {
  let result = true;
  const cacheObjString = JSON.stringify(createCacheObj(testPath));
  const getCacheFile = path.resolve(cacheDir, cacheFilePrefix + crypto.createHash(cacheHash).update(testPath, cacheEncoding).digest('hex'));
  if (fs.existsSync(getCacheFile)) {
    result = cacheObjString !== fs.readFileSync(getCacheFile, cacheEncoding);
  }

  if (result) {
    fs.writeFileSync(getCacheFile, cacheObjString);
  }

  return result;
};

const setupRollupTest = async (rootDir, testPath, cacheDir, watch) => {
  const rollupWatchers = [];
  const rollupServers = [];
  const testDir = path.dirname(testPath);
  const testName = path.basename(testDir);
  const changed = cacheDir && !watch ? filesChanged(testPath, cacheDir) : true;
  const buildFolderExists = fs.existsSync(path.resolve(testDir, deploymentConfig.build));

  if (changed || !buildFolderExists) {
    const rollupConfigPath = path.resolve(rootDir, rollupConfigName);

    if (fs.existsSync(rollupConfigPath)) {
      const rollupConfig = require(rollupConfigPath); // eslint-disable-line

      if (typeof rollupConfig === 'function') {
        try {
          const htmlFilePath = path.resolve(testDir, deploymentConfig.html.input);
          const dist = path.resolve(testDir, deploymentConfig.build);
          const getHtmlFileContent = () => (fs.existsSync(htmlFilePath) ? fs.readFileSync(htmlFilePath, 'utf8') : null);
          const logBuilding = (re) => {
            const text = re ? ' RE-BUILDING ' : ' BUILDING ';
            console.log(`${chalk.bgBlue.bold.whiteBright(text)} ${chalk.blackBright(testPath)}`); // eslint-disable-line
          };
          const logBundleFinish = (duration) => {
            if (duration) {
              console.log(`Bundle finished after ${Math.round(duration / 1000)} seconds.`); // eslint-disable-line
            } else {
              console.log(`Bundle finished.`); // eslint-disable-line
            }
          };

          let rollupConfigObj = rollupConfig(undefined, {
            project: rootDir,
            overwrite: ({ defaultConfig }) => {
              return {
                dist,
                input: path.resolve(testDir, deploymentConfig.js.input),
                file: deploymentConfig.js.output,
                types: null,
                minVersions: false,
                esmBuild: false,
                sourcemap: true,
                name: testName,
                pipeline: [
                  rollupPluginStyles(),
                  ...defaultConfig.pipeline,
                  rollupPluginHtml({
                    title: `Jest-Browser: ${testName}`,
                    fileName: deploymentConfig.html.output,
                    template: genHtmlTemplateFunc(getHtmlFileContent),
                    meta: [{ charset: 'utf-8' }, { 'http-equiv': 'X-UA-Compatible', content: 'IE=edge' }],
                  }),
                  ...(watch
                    ? [
                        rollupAdditionalWatchFiles([htmlFilePath]),
                        rollupPluginServe({
                          contentBase: dist,
                          historyApiFallback: `/${deploymentConfig.html.output}`,
                          port: deploymentConfig.dev.servePort,
                          onListening(server) {
                            rollupServers.push(server);
                          },
                        }),
                        rollupPluginLivereload({
                          watch: dist,
                          port: deploymentConfig.dev.livereloadPort,
                        }),
                      ]
                    : []),
                ],
              };
            },
            silent: true,
            fast: true,
          });

          if (!Array.isArray(rollupConfigObj)) {
            rollupConfigObj = [rollupConfigObj];
          }

          for (let i = 0; i < rollupConfigObj.length; i++) {
            const inputConfig = rollupConfigObj[i];
            let { output } = inputConfig;

            if (!Array.isArray(output)) {
              output = [output];
            }

            if (watch) {
              let firstWatch = true;
              const rollupWatcher = rollup.watch({
                ...inputConfig,
                output,
              });

              // eslint-disable-next-line no-await-in-loop
              await new Promise((resolve) => {
                rollupWatcher.on('event', ({ code, duration, error, result }) => {
                  if (code === 'ERROR') {
                    console.log('Error:', error); // eslint-disable-line
                  }
                  if (code === 'START') {
                    if (firstWatch) {
                      console.log(''); // eslint-disable-line
                    }
                    logBuilding(!firstWatch);
                  }
                  if (code === 'BUNDLE_END') {
                    logBundleFinish(duration);
                    if (result && result.close) {
                      result.close();
                    }
                  }
                  if (code === 'END') {
                    console.log('Watching for changes, press ENTER to continue.'); // eslint-disable-line
                    console.log(''); // eslint-disable-line
                    if (firstWatch) {
                      firstWatch = false;
                      resolve();
                    }
                  }
                });
              });

              rollupWatchers.push(rollupWatcher);
            } else {
              console.log(''); // eslint-disable-line
              logBuilding();
              const startTime = Date.now();
              // eslint-disable-next-line no-await-in-loop
              const bundle = await rollup.rollup(inputConfig);

              for (let v = 0; v < output.length; v++) {
                const outputConfig = output[i];
                // eslint-disable-next-line no-await-in-loop
                await bundle.write(outputConfig);

                const endTime = Date.now();
                logBundleFinish(endTime - startTime);
              }

              console.log(''); // eslint-disable-line
            }
          }

          if (watch) {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            await new Promise((resolve) => {
              rl.on('line', () => {
                resolve();
              });
              rl.on('close', () => {
                resolve();
              });
            });

            rl.close();
            rollupWatchers.forEach((watcher) => {
              watcher.close();
            });
            rollupServers.forEach((server) => {
              server.close();
            });
            if (rollupPluginLivereload && global.PLUGIN_LIVERELOAD && global.PLUGIN_LIVERELOAD.server) {
              global.PLUGIN_LIVERELOAD.server.close();
              global.PLUGIN_LIVERELOAD.server = null;
            }
          }
        } catch (e) {
          console.warn(e);
        }
      }
    }
  }
};

const cleanupRollupTest = async (testPath, cache) => {
  if (!cache) {
    await del(path.resolve(path.dirname(testPath), deploymentConfig.build));
  }
};

module.exports = { setupRollupTest, cleanupRollupTest };
