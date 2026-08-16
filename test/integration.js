const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tests } = require('@iobroker/testing');

const controllerVersion = '7.2.2';
const testDirectory = path.join(os.tmpdir(), 'test-iobroker.davis');
const controllerDirectory = path.join(testDirectory, 'node_modules', 'iobroker.js-controller');
const systemConfig = path.join(testDirectory, 'iobroker-data', 'iobroker.json');

if (!fs.existsSync(systemConfig)) {
    fs.mkdirSync(testDirectory, { recursive: true });
    fs.writeFileSync(
        path.join(testDirectory, 'package.json'),
        JSON.stringify({ dependencies: { 'iobroker.js-controller': controllerVersion } }),
    );
    execFileSync('npm', ['install', '--omit=dev'], {
        cwd: testDirectory,
        shell: process.platform === 'win32',
        stdio: 'inherit',
    });
    execFileSync('node', ['iobroker.js', 'setup', 'first', '--console'], {
        cwd: controllerDirectory,
        stdio: 'inherit',
    });
}

tests.integration(path.join(__dirname, '..'), {
    controllerVersion,
});