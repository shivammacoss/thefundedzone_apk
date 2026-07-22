/**
 * Config plugin: bundles the local TradingView Charting Library (chart-assets/)
 * into the native app so the WebView can load it from disk — no website, no
 * runtime download.
 *
 *   Android → android/app/src/main/assets/chart/   (file:///android_asset/chart/index.html)
 *   iOS     → <project>/chart/ added as a folder reference in Resources
 *             (loaded via FileSystem.bundleDirectory + 'chart/index.html')
 *
 * Runs during `expo prebuild` / EAS build.
 */
const { withDangerousMod, withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const withChartAndroid = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'chart-assets');
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'chart');
      fs.rmSync(dest, { recursive: true, force: true });
      copyDir(src, dest);
      return cfg;
    },
  ]);

const withChartIosCopy = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'chart-assets');
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'chart');
      fs.rmSync(dest, { recursive: true, force: true });
      copyDir(src, dest);
      return cfg;
    },
  ]);

const withChartIosResource = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    // Add `chart` as a folder reference in the app's Resources build phase so the
    // whole directory ships in the bundle with its structure preserved.
    try {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: 'chart',
        groupName: projectName,
        project,
        isBuildFile: true,
        verbose: false,
      });
    } catch (e) {
      // Folder reference add is best-effort; log so it surfaces in build output.
      // eslint-disable-next-line no-console
      console.warn('[withChartLibrary] iOS resource add failed:', e && e.message);
    }
    return cfg;
  });

module.exports = function withChartLibrary(config) {
  config = withChartAndroid(config);
  config = withChartIosCopy(config);
  config = withChartIosResource(config);
  return config;
};
