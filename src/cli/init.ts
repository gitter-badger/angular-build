﻿import * as path from 'path';
import * as fs from 'fs-extra';
import * as resolve from 'resolve';
import * as semver from 'semver';
import * as ajv from 'ajv';
import * as chalk from 'chalk';
import * as yargs from 'yargs';

import { CliOptions } from './models';
import { AngularBuildConfig, AppConfig } from '../models';
import { IconPluginOptions } from '../plugins/icon-webpack-plugin';

import {
    readJsonAsync, chageDashCase, mapToYargsType, checkFileOrDirectoryExistsAsync, findFileOrDirectoryFromPossibleAsync,
    getVersionfromPackageJsonAsync, askAsync, spawnAsync
} from '../utils';

// ReSharper disable once CommonJsExternalModule
const schema = require('../../configs/schema.json');

export interface PackageToCheck {
    packageName: string;
    isPreReleased?: boolean;
    version?: string;
    resolvedPath?: string;
};

export interface PackageJsonConfig {
    dependencies?: { [key: string]: string },
    devDependencies?: { [key: string]: string }
}

export interface CommandOptions {
    /**
     * Confirm user by prompting
     * @default false
     */
    prompt?: boolean;
    /**
     * Force creating package.json file and not prompt you for any options
     * @default false
     */
    force?: boolean;
    /**
     * Link angular-build cli to current project
     * @default false
     */
    linkCli?: boolean;
    /**
     * Skip install tooling
     * @default false
     */
    skipInstallTooling?: boolean;
    /**
     * Install loaders only
     * @default true
     */
    installLoadersOnly?: boolean;
    /**
     * Override angular-build.json file
     */
    overrideAngularBuildConfigFile?: boolean;
    /**
     * Webpack config file name
     */
    webpackConfigFileName?: string;
    /**
     * Override webpack config file
     * @default true
     */
    overrideWebpackConfigFile?: boolean;
}

export interface InitConfig {
    cwd: string;
    cliIsLocal?: boolean;

    commandOptions?: CommandOptions & AppConfig;
    cliPackageJsonConfig?: PackageJsonConfig;

    angularBuildConfigMaster?: AngularBuildConfig;
    userAngularBuildConfig?: any;
    angularBuildConfigFileExists?: boolean;

    userAngularCliConfig?: any;
    angularCliConfigFileExists?: boolean;

    faviconConfigMaster?: IconPluginOptions;

    webpackConfigFileExists?: boolean;

    userPackageConfigFileExists?: boolean;
    userPackageConfigFile?: string;
    userPackageConfig?: any;

    tsConfigMaster?: any;
    tsConfigWebpackMaster?: any;
    tsConfigWebpackAoTMaster?: any;

    faviconConfigFileExists?: boolean;
    userFaviconConfig?: any;

    isAspNetCore?: boolean;
}

export function getInitCommandModule(cliVersion: string): yargs.CommandModule {
    const initCommandUsage = `\n${chalk.green(`angular-build ${cliVersion}`)}\n
Usage:
  ngb init [options...]`;


    const initCommandModule: yargs.CommandModule = {
        command: 'init',
        describe: 'Create angular-build config files',
        builder: (yargv: yargs.Argv) => {
            let yargvObj = yargv
                .reset()
                .usage(initCommandUsage)
                .example('ngb init --prompt', 'Create angular-build config files with user prompt option')
                .help('h')
                .option('p',
                {
                    alias: 'prompt',
                    describe: 'Confirm user by prompting',
                    type: 'boolean',
                    default: false
                })
                .option('f',
                {
                    alias: 'force',
                    describe: 'Force creating package.json file and not prompt you for any options',
                    type: 'boolean',
                    default: false
                })
                .option('link-cli',
                {
                    alias: ['l', 'linkCli'],
                    describe: 'Link angular-build cli to current project',
                    type: 'boolean',
                    default: false
                })
                .option('skip-install-tooling',
                {
                    describe: 'Skip install tooling',
                    type: 'boolean',
                    default: false
                })
                .option('install-loaders-only',
                {
                    describe: 'Install loaders only',
                    type: 'boolean',
                    default: true
                })
                .option('override-angular-build-config-file',
                {
                    describe: 'Override angular-build.json file',
                    type: 'boolean',
                    default: undefined
                })
                .option('webpack-config-file-name',
                {
                    describe: 'Webpack config file name',
                    type: 'string'
                })
                .option('override-webpack-config-file',
                {
                    describe: 'Override webpack config file',
                    type: 'boolean',
                    default: true
                });

            const appConfigSchema: any = schema.definitions.AppConfig.properties;
            Object.keys(appConfigSchema).filter((key: string) => key !== 'extends').forEach((key: string) => {
                yargvObj = yargvObj.options(chageDashCase(key),
                    {
                        describe: appConfigSchema[key].description || key,
                        type: mapToYargsType(appConfigSchema[key].type),
                        default: undefined
                    });
            });

            return yargvObj;
        },
        handler: null
    };

    return initCommandModule;
}

// Command
//
export function init(cliOptions: CliOptions): Promise<number> {
    const projectRoot = cliOptions.cwd || process.cwd();

    const cfg: InitConfig = {
        cwd: projectRoot,
        cliIsLocal: cliOptions.cliIsLocal,
        commandOptions: Object.assign({}, cliOptions.commandOptions || {})
    };

    return checkFileOrDirectoryExistsAsync(path.resolve(projectRoot, 'package.json'))
        .then((exists: boolean) => {
            if (exists) {
                cfg.userPackageConfigFileExists = true;
                cfg.userPackageConfigFile = path.resolve(projectRoot, 'package.json');
                return Promise.resolve();
            } else {
                if (cfg.commandOptions.force) {
                    return spawnAsync('npm', ['init', '-f', '--color', 'always', '--loglevel', 'error'])
                        .then(() => {
                            cfg.userPackageConfigFileExists = true;
                            cfg.userPackageConfigFile = path.resolve(projectRoot, 'package.json');
                        });
                } else {
                    const msg = `'package.json' file doesn't exist.\nPlease run ${chalk
                        .cyan('npm init')
                        } command to init 'package.json' file or run ${chalk
                            .cyan('ngb init -f')} to force create 'package.json' file.`;
                    return Promise.reject(msg);
                }
            }
        })
        // Reading master files
        .then(() => {
            return readJsonAsync(require.resolve('../../package.json')).then(cliPkgConfig => {
                cfg.cliPackageJsonConfig = cliPkgConfig;
            });
        })
        .then(() => {
            return readJsonAsync(require.resolve('../../configs/angular-build.json'))
                .then((angularBuildConfig: AngularBuildConfig) => {
                    cfg.angularBuildConfigMaster = angularBuildConfig;
                });
        })
        .then(() => {
            return readJsonAsync(require.resolve('../../configs/tsconfig.json'))
                .then((tsConfig: any) => {
                    cfg.tsConfigMaster = tsConfig;
                });
        })
        .then(() => {
            return readJsonAsync(require.resolve('../../configs/tsconfig.webpack.json'))
                .then((tsConfig: any) => {
                    cfg.tsConfigWebpackMaster = tsConfig;
                });
        })
        .then(() => {
            return readJsonAsync(require.resolve('../../configs/tsconfig.webpack.aot.json'))
                .then((tsConfig: any) => {
                    cfg.tsConfigWebpackAoTMaster = tsConfig;
                });
        })
        .then(() => {
            return readJsonAsync(require.resolve('../../configs/favicon-config.json'))
                .then((faviconConfig: IconPluginOptions) => {
                    cfg.faviconConfigMaster = faviconConfig;
                });
        })
        // Reead user angular-build.json
        .then(() => {
            const cliPath = path.resolve(projectRoot, 'angular-build.json');
            return checkFileOrDirectoryExistsAsync(cliPath).then((exists: boolean) => {
                cfg.angularBuildConfigFileExists = exists;
                if (exists) {
                    return readJsonAsync(cliPath).then((buildConfig: any) => {
                        buildConfig = buildConfig || {};
                        buildConfig.apps = buildConfig.apps || [];
                        cfg.userAngularBuildConfig = buildConfig;
                    });
                } else {
                    return Promise.resolve();
                }
            });
        })
        // Reead user angular-cli.json
        .then(() => {
            const cliPath = path.resolve(projectRoot, 'angular-cli.json');
            return checkFileOrDirectoryExistsAsync(cliPath).then((exists: boolean) => {
                cfg.angularCliConfigFileExists = exists;
                if (exists) {
                    return readJsonAsync(cliPath).then((cliConfig: any) => {
                        cliConfig = cliConfig || {};
                        cliConfig.apps = cliConfig.apps || [];
                        cfg.userAngularCliConfig = cliConfig;
                    });
                } else {
                    return Promise.resolve();
                }
            });
        })
        // merge
        .then(() => mergeConfigAsync(cfg))
        // 1. install toolings
        .then(() => {
            if (cfg.commandOptions.skipInstallTooling) {
                return Promise.resolve();
            }
            return checkAndInstallToolings(cfg);
        })
        // 2. save angular-build.json file
        .then(() => {
            if (cfg.angularBuildConfigFileExists && cfg.commandOptions.overrideAngularBuildConfigFile === false) {
                return Promise.resolve();
            } else {
                if (cfg.angularBuildConfigFileExists && !cfg.commandOptions.overrideAngularBuildConfigFile) {
                    const validate = ajv().compile(schema);
                    const valid = validate(cfg.userAngularBuildConfig);
                    if (valid) {
                        return Promise.resolve();
                    }
                }

                return new Promise((resolve, reject) => {
                    fs.writeFile(path.resolve(projectRoot, 'angular-build.json'),
                        JSON.stringify(cfg.angularBuildConfigMaster, null, 2),
                        err => err ? reject(err) : resolve());
                })
                    .then(() => {
                        console.log(chalk.green('Created:') + ' angular-build.json');
                        return;
                    });
            }
        })
        // 3. copy webpack.config file
        .then(() => {
            if (cfg.webpackConfigFileExists && cfg.commandOptions.overrideWebpackConfigFile === false) {
                return Promise.resolve();
            } else {
                const webpackConfigFileName = cfg.commandOptions.webpackConfigFileName || 'webpack.config.js';

                return new Promise((resolve, reject) => {
                    if (webpackConfigFileName.match(/\.ts$/i)) {
                        fs.copy(require.resolve('../../configs/webpack.config.ts'),
                            path.resolve(projectRoot, webpackConfigFileName),
                            err => {
                                err ? reject(err) : resolve();
                            });
                    } else {
                        fs.copy(require.resolve('../../configs/webpack.config.js'),
                            path.resolve(projectRoot, webpackConfigFileName),
                            err => {
                                err ? reject(err) : resolve();
                            });
                    }
                })
                    .then(() => {
                        console.log(chalk.green('Created:') + ' ' + webpackConfigFileName);
                        return;
                    });
            }
        })
        // 4. copy empty.js
        .then(() => {
            const emptyPath = path.resolve(projectRoot, 'empty.js');
            return checkFileOrDirectoryExistsAsync(emptyPath).then(exists => {
                if (exists) {
                    return Promise.resolve();
                } else {
                    return new Promise((resolve, reject) => {
                            fs.copy(require.resolve('../../configs/empty.js'),
                                emptyPath,
                                err => {
                                    err ? reject(err) : resolve();
                                });
                        })
                        .then(() => {
                            console.log(chalk.green('Created:') + ' empty.js');
                            return;
                        });
                }
            });
        })
        // 5. save tsconfig.webpack.json file
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const tsConfigPath = path.resolve(projectRoot, 'tsconfig.webpack.json');
            let userTsConfigExists = false;
            return checkFileOrDirectoryExistsAsync(tsConfigPath).then(exists => {
                let outDir = `${appConfig.outDir}/out-tsc`;

                const excludeList: string[] = cfg.tsConfigWebpackMaster.exclude || [];
                if (excludeList.indexOf(appConfig.outDir) === -1) {
                    excludeList.push(appConfig.outDir);
                }
                if (excludeList.indexOf(`${appConfig.root}/**/*.spec.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/**/*.spec.ts`);
                }
                if (excludeList.indexOf(`${appConfig.root}/**/*.e2e.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/**/*.e2e.ts`);
                }
                if (excludeList.indexOf(`${appConfig.root}/main*.aot.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/main*.aot.ts`);
                }

                if (exists) {
                    userTsConfigExists = true;
                    // Merge
                    return readJsonAsync(tsConfigPath).then((userTsConfig: any) => {

                        if (userTsConfig.compilerOptions && userTsConfig.compilerOptions.outDir) {
                            outDir = userTsConfig.compilerOptions.outDir;
                        }

                        if (userTsConfig.exclude && userTsConfig.exclude.length) {
                            userTsConfig.exclude.forEach((e: string) => {
                                if (excludeList.indexOf(e) === -1) {
                                    excludeList.push(e);
                                }
                            });
                        }

                        const mergedConfig: any = Object.assign({}, userTsConfig, cfg.tsConfigWebpackMaster);
                        mergedConfig.compilerOptions.outDir = outDir;
                        mergedConfig.exclude = excludeList;
                        return mergedConfig;
                    });
                } else {
                    const mergedConfig: any = cfg.tsConfigWebpackMaster;
                    mergedConfig.compilerOptions.outDir = outDir;
                    mergedConfig.exclude = excludeList;
                    return Promise.resolve(mergedConfig);
                }
            }).then((tsConfig: any) => {
                // Create
                return new Promise((resolve, reject) => {
                    fs.writeFile(tsConfigPath,
                        JSON.stringify(tsConfig, null, 2),
                        err => err ? reject(err) : resolve());
                })
                    .then(() => {
                        console.log(chalk.green(`${userTsConfigExists ? 'Updated' : 'Created'}:`) +
                            ' tsconfig.webpack.json');
                        return;
                    });
            });
        })
        // 6. save tsconfig.webpack.aot.json file
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const tsConfigPath = path.resolve(projectRoot, 'tsconfig.webpack.aot.json');
            let userTsConfigExists = false;
            return checkFileOrDirectoryExistsAsync(tsConfigPath).then(exists => {
                let outDir = `${appConfig.outDir}/out-tsc`;

                const excludeList: string[] = cfg.tsConfigWebpackAoTMaster.exclude || [];
                if (excludeList.indexOf(appConfig.outDir) === -1) {
                    excludeList.push(appConfig.outDir);
                }
                if (excludeList.indexOf(`${appConfig.root}/**/*.spec.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/**/*.spec.ts`);
                }
                if (excludeList.indexOf(`${appConfig.root}/**/*.e2e.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/**/*.e2e.ts`);
                }

                if (exists) {
                    userTsConfigExists = true;
                    // Merge
                    return readJsonAsync(tsConfigPath).then((userTsConfig: any) => {

                        if (userTsConfig.compilerOptions && userTsConfig.compilerOptions.outDir) {
                            outDir = userTsConfig.compilerOptions.outDir;
                        }

                        if (userTsConfig.exclude && userTsConfig.exclude.length) {
                            userTsConfig.exclude.forEach((e: string) => {
                                if (excludeList.indexOf(e) === -1) {
                                    excludeList.push(e);
                                }
                            });
                        }

                        const mergedConfig: any = Object.assign({}, userTsConfig, cfg.tsConfigWebpackAoTMaster);
                        mergedConfig.compilerOptions.outDir = outDir;
                        mergedConfig.exclude = excludeList;
                        return mergedConfig;
                    });
                } else {
                    const mergedConfig: any = cfg.tsConfigWebpackAoTMaster;
                    mergedConfig.compilerOptions.outDir = outDir;
                    mergedConfig.exclude = excludeList;
                    return Promise.resolve(mergedConfig);
                }
            }).then((tsConfig: any) => {
                // Create
                return new Promise((resolve, reject) => {
                    fs.writeFile(tsConfigPath,
                        JSON.stringify(tsConfig, null, 2),
                        err => err ? reject(err) : resolve());
                })
                    .then(() => {
                        console.log(chalk.green(`${userTsConfigExists ? 'Updated' : 'Created'}:`) +
                            ' tsconfig.webpack.aot.json');
                        return;
                    });
            });
        })
        // 7. save root tsconfig.json file
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const tsConfigPath = path.resolve(projectRoot, 'tsconfig.json');
            let userTsConfigExists = false;
            return checkFileOrDirectoryExistsAsync(tsConfigPath).then(exists => {
                let outDir = `${appConfig.outDir}/out-tsc`;

                const excludeList: string[] = cfg.tsConfigMaster.exclude || [];
                if (excludeList.indexOf(appConfig.outDir) === -1) {
                    excludeList.push(appConfig.outDir);
                }
                if (excludeList.indexOf(`${appConfig.root}/**/*.spec.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/**/*.spec.ts`);
                }
                if (excludeList.indexOf(`${appConfig.root}/**/*.e2e.ts`) === -1) {
                    excludeList.push(`${appConfig.root}/**/*.e2e.ts`);
                }

                if (exists) {
                    userTsConfigExists = true;
                    // Merge
                    return readJsonAsync(tsConfigPath).then((userTsConfig: any) => {

                        if (userTsConfig.compilerOptions && userTsConfig.compilerOptions.outDir) {
                            outDir = userTsConfig.compilerOptions.outDir;
                        }

                        if (userTsConfig.exclude && userTsConfig.exclude.length) {
                            userTsConfig.exclude.forEach((e: string) => {
                                if (excludeList.indexOf(e) === -1) {
                                    excludeList.push(e);
                                }
                            });
                        }

                        const mergedConfig: any = Object.assign({}, userTsConfig, cfg.tsConfigMaster);
                        mergedConfig.compilerOptions.outDir = outDir;
                        mergedConfig.exclude = excludeList;
                        return mergedConfig;
                    });
                } else {
                    const mergedConfig: any = cfg.tsConfigMaster;
                    mergedConfig.compilerOptions.outDir = outDir;
                    mergedConfig.exclude = excludeList;
                    return Promise.resolve(mergedConfig);
                }
            }).then((tsConfig: any) => {
                // Create
                return new Promise((resolve, reject) => {
                    fs.writeFile(tsConfigPath,
                        JSON.stringify(tsConfig, null, 2),
                        err => err ? reject(err) : resolve());
                })
                    .then(() => {
                        console.log(chalk.green(`${userTsConfigExists ? 'Updated' : 'Created'}:`) +
                            ' tsconfig.json');
                        return;
                    });
            });
        })
        // 8. Create src folder
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const srcPath = path.resolve(projectRoot, appConfig.root);
            return checkFileOrDirectoryExistsAsync(srcPath, true).then(exists => {
                if (exists) {
                    return Promise.resolve();
                } else {
                    return new Promise((resolve, reject) => {
                        fs.mkdir(srcPath, err => err ? reject(err) : resolve());
                    });
                }
            }
            );
        })
        // 9. save favicon-config.json file
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const faviconConfigFileName = appConfig.faviconConfig || 'favicon-config.json';
            const faviconConfigPath = path
                .resolve(projectRoot, appConfig.root, faviconConfigFileName);

            let userFaviconConfigExists = false;
            return checkFileOrDirectoryExistsAsync(faviconConfigPath).then(exists => {
                if (exists) {
                    userFaviconConfigExists = true;
                    // Merge
                    return readJsonAsync(faviconConfigPath).then((userFaviconConfig: any) => {
                        userFaviconConfig.masterPicture = userFaviconConfig.masterPicture ||
                            cfg.faviconConfigMaster.masterPicture;
                        return Object.assign({}, cfg.faviconConfigMaster, userFaviconConfig);
                    });
                } else {
                    return Promise.resolve(cfg.faviconConfigMaster);
                }
            }).then((faviconConfig: any) => {
                // Create
                return new Promise((resolve, reject) => {
                    fs.writeFile(faviconConfigPath,
                        JSON.stringify(faviconConfig, null, 2),
                        err => err ? reject(err) : resolve());
                })
                    .then(() => {
                        const relativePath = path.relative(projectRoot, faviconConfigPath);
                        console.log(chalk.green(`${userFaviconConfigExists ? 'Updated' : 'Created'}:`) +
                            ' ' +
                            relativePath);
                        return;
                    });
            });
        })
        // 10. copy polyfills.browser.ts
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            return checkFileOrDirectoryExistsAsync(path.resolve(projectRoot, appConfig.root, 'polyfills.browser.ts'))
                .then(exists => {
                    if (exists) {
                        return Promise.resolve();
                    } else {
                        return new Promise((resolve, reject) => {
                            fs.copy(require.resolve('../../configs/polyfills.browser.ts'),
                                path.resolve(projectRoot, appConfig.root, 'polyfills.browser.ts'),
                                err => {
                                    err ? reject(err) : resolve();
                                });
                        })
                            .then(() => {
                                console.log(chalk.green('Created:') +
                                    ' ' +
                                    path.join(appConfig.root, 'polyfills.browser.ts'));
                                return;
                            });
                    }
                });

        })
        // 11. copy rxjs.imports.ts
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            return checkFileOrDirectoryExistsAsync(path.resolve(projectRoot, appConfig.root, 'rxjs.imports.ts'))
                .then(exists => {
                    if (exists) {
                        return Promise.resolve();
                    } else {
                        return new Promise((resolve, reject) => {
                            fs.copy(require.resolve('../../configs/rxjs.imports.ts'),
                                path.resolve(projectRoot, appConfig.root, 'rxjs.imports.ts'),
                                err => {
                                    err ? reject(err) : resolve();
                                });
                        })
                            .then(() => {
                                console.log(chalk.green('Created:') +
                                    ' ' +
                                    path.join(appConfig.root, 'rxjs.imports.ts'));
                                return;
                            });
                    }
                });

        })
        // 12. copy custom-typings.d.ts
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            return checkFileOrDirectoryExistsAsync(path.resolve(projectRoot, appConfig.root, 'custom-typings.d.ts'))
                .then(exists => {
                    if (exists) {
                        return Promise.resolve();
                    } else {
                        return new Promise((resolve, reject) => {
                            fs.copy(require.resolve('../../configs/custom-typings.d.ts'),
                                path.resolve(projectRoot, appConfig.root, 'custom-typings.d.ts'),
                                err => {
                                    err ? reject(err) : resolve();
                                });
                        })
                            .then(() => {
                                console.log(chalk.green('Created:') +
                                    ' ' +
                                    path.join(appConfig.root, 'custom-typings.d.ts'));
                                return;
                            });
                    }
                });

        })
        // 13. Create environments folder
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const environmentsPath = path.resolve(projectRoot, appConfig.root, 'environments');
            return checkFileOrDirectoryExistsAsync(environmentsPath, true).then(exists => {
                if (exists) {
                    return Promise.resolve();
                } else {
                    return new Promise((resolve, reject) => {
                        fs.mkdir(environmentsPath, err => err ? reject(err) : resolve());
                    });
                }
            }
            );
        })
        // 14. Copy environment files
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            return checkFileOrDirectoryExistsAsync(path
                .resolve(projectRoot, appConfig.root, 'environments', 'environment.ts'))
                .then(exists => {
                    if (exists) {
                        return Promise.resolve();
                    } else {
                        return new Promise((resolve, reject) => {
                            fs.copy(require.resolve('../../configs/environment.ts'),
                                path.resolve(projectRoot, appConfig.root, 'environments', 'environment.ts'),
                                err => {
                                    err ? reject(err) : resolve();
                                });
                        })
                            .then(() => {
                                console.log(chalk.green('Created:') +
                                    ' ' +
                                    path.join(appConfig.root, 'environments', 'environment.ts'));
                                return;
                            });
                    }
                }).then(() => {
                    return checkFileOrDirectoryExistsAsync(path.resolve(projectRoot,
                        appConfig.root,
                        'environments',
                        'environment.prod.ts'))
                        .then(exists => {
                            if (exists) {
                                return Promise.resolve();
                            } else {
                                return new Promise((resolve, reject) => {
                                    fs.copy(require.resolve('../../configs/environment.prod.ts'),
                                        path
                                            .resolve(projectRoot,
                                            appConfig
                                                .root,
                                            'environments',
                                            'environment.prod.ts'),
                                        err => {
                                            err ? reject(err) : resolve();
                                        });
                                })
                                    .then(() => {
                                        console.log(chalk.green('Created:') +
                                            ' ' +
                                            path.join(appConfig.root, 'environments', 'environment.prod.ts'));
                                        return;
                                    });
                            }
                        });
                });
        })
        // 15. Update package.json
        .then(() => {
            const appConfig = cfg.angularBuildConfigMaster.apps[0];
            const configOpt = typeof cfg.commandOptions.webpackConfigFileName === 'undefined' ||
                cfg.commandOptions.webpackConfigFileName === 'webpack.config.js'
                ? ' '
                : ` --config ${cfg.commandOptions.webpackConfigFileName} `;
            const packageScripts: any = {
                "build:dll": `cross-env NODE_ENV=development webpack${configOpt}--profile --colors --bail`,
                "prebuild:dll": `npm run clean:dist`,
                "build:dev": `cross-env NODE_ENV=development webpack${configOpt}--profile --colors --bail`,
                "build:prod": `cross-env NODE_ENV=production webpack${configOpt}--profile --colors --bail`,
                "prebuild:prod": `npm run clean:dist`,
                "build:aot": `cross-env NODE_ENV=production webpack${configOpt}--profile --colors --bail`,
                "prebuild:aot": `npm run clean:dist && npm run clean:aot:compiled`,
                "build": `npm run build:dev`,
                "clean:dist": `npm run rimraf -- ${appConfig.outDir}/**/*`,
                "clean:aot-compiled": `npm run rimraf -- aot-compiled`,
                "cross-env": 'cross-env',
                "lint": `npm run tslint \"${appConfig.root}/**/*.ts\"`,
                "rimraf": 'rimraf',
                "tslint": 'tslint',
                "webpack": 'webpack'
            };

            // read package json
            return readJsonAsync(cfg.userPackageConfigFile).then((userPackageConfig: any) => {
                cfg.userPackageConfig = userPackageConfig;

                let shouldUpdate = true;
                if (cfg.userPackageConfig.scripts) {
                    const foundLen = Object.keys(packageScripts)
                        .filter((key: string) => cfg.userPackageConfig.scripts[key] &&
                            cfg.userPackageConfig.scripts[key] === packageScripts[key]).length;
                    if (foundLen === Object.keys(packageScripts).length) {
                        shouldUpdate = false;
                    }
                }
                if (shouldUpdate) {
                    cfg.userPackageConfig.scripts = Object
                        .assign({}, cfg.userPackageConfig.scripts || {}, packageScripts);
                    return new Promise((resolve, reject) => {
                        fs.writeFile(cfg.userPackageConfigFile,
                            JSON.stringify(cfg.userPackageConfig, null, 2),
                            err => err ? reject(err) : resolve());
                    })
                        .then(() => {
                            console.log(chalk.green('Updated:') + ' package.json');
                            return;
                        });
                } else {
                    return Promise.resolve();
                }
            });
        })
        .then(() => {
            if (cfg.commandOptions.linkCli && !cfg.cliIsLocal) {
                console.log('\nLinking @bizappframework/angular-build...');
                return spawnAsync('npm',
                    ['link', '@bizappframework/angular-build', '--color', 'always', '--loglevel', 'error']);
            } else {
                return Promise.resolve(0);
            }
        })
        .then(() => {
            console.log('\nInitialization complete.');
            return 0;
        });
}

// Private functions
function mergeConfigAsync(cfg: InitConfig): Promise<void> {
    return mergeConfigWithPossibleAsync(cfg)
        .then(() => mergeConfigWithAngularCli(cfg))
        .then(() => mergeConfigWithUserAngularBuildConfig(cfg))
        .then(() => mergeConfigWithUserFaviconConfig(cfg))
        .then(() => mergeWithCommandOptions(cfg))
        .then(() => (cfg.commandOptions.prompt && !cfg.commandOptions.force)
            ? mergeConfigWithPromptAsync(cfg)
            : Promise.resolve());
}

function mergeConfigWithPossibleAsync(cfg: InitConfig): Promise<void> {
    const projectRoot = cfg.cwd;
    const appConfig = cfg.angularBuildConfigMaster.apps[0];

    const possibleSrcDirs = ['Client', 'src'];
    const possibleOutDirs = ['wwwroot', 'dist'];
    const possibleMains = ['main.browser.ts', 'main.ts'];
    const possibleStyles = ['styles.scss', 'styles.sass', 'styles.less', 'styles.stylus', 'styles.css'];
    const possibleFavicons = ['logo.svg', 'logo.png', 'favlogo.svg', 'favlogo.png', 'favicon.svg', 'favicon.png'];

    // root
    return findFileOrDirectoryFromPossibleAsync(projectRoot, possibleSrcDirs, appConfig.root, true)
        .then((foundRoot: string) => {
            appConfig.root = foundRoot || appConfig.root;

            // outDir
            return findFileOrDirectoryFromPossibleAsync(projectRoot, possibleOutDirs, appConfig.outDir, true)
                .then((foundOutDir: string) => {
                    appConfig.outDir = foundOutDir || appConfig.outDir;
                    return;
                });
        })
        .then(() => {
            // main
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                possibleMains,
                appConfig.main,
                false)
                .then((foundMain: string) => {
                    appConfig.main = foundMain || appConfig.main;
                    return;
                });
        })
        .then(() => {
            // styles
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                possibleStyles,
                'styles.scss',
                false)
                .then((foundStyle: string) => {
                    if (foundStyle) {
                        if (Array.isArray(appConfig.styles)) {
                            if (appConfig.styles.indexOf(foundStyle) === -1) {
                                appConfig.styles.push(foundStyle);
                            }
                        } else {
                            if (!appConfig.styles) {
                                appConfig.styles = [foundStyle];
                            }
                        }
                    }

                    return;
                });
        })
        .then(() => {
            // asset folder
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                ['assets'],
                'asset',
                true)
                .then((foundAsset: string) => {
                    if (foundAsset) {
                        if (Array.isArray(appConfig.assets)) {
                            if (appConfig.assets.indexOf(foundAsset) === -1 &&
                                appConfig.assets.indexOf('assets/**/*') === -1) {
                                appConfig.assets.push('assets/**/*');
                            }
                        } else {
                            if (!appConfig.styles) {
                                appConfig.assets = ['assets/**/*'];
                            }
                        }
                    }

                    return;
                });
        })
        .then(() => {
            // robots.txt
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                ['robots.txt'],
                'robots.txt',
                false)
                .then((foundAsset: string) => {
                    if (foundAsset) {
                        if (Array.isArray(appConfig.assets)) {
                            if (appConfig.assets.indexOf(foundAsset) === -1) {
                                appConfig.assets.push(foundAsset);
                            }
                        } else {
                            if (!appConfig.styles) {
                                appConfig.assets = [foundAsset];
                            }
                        }
                    }

                    return;
                });
        })
        .then(() => {
            // humans.txt
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                ['humans.txt'],
                'humans.txt',
                false)
                .then((foundAsset: string) => {
                    if (foundAsset) {
                        if (Array.isArray(appConfig.assets)) {
                            if (appConfig.assets.indexOf(foundAsset) === -1) {
                                appConfig.assets.push(foundAsset);
                            }
                        } else {
                            if (!appConfig.styles) {
                                appConfig.assets = [foundAsset];
                            }
                        }
                    }

                    return;
                });
        })
        .then(() => {
            // favicon
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                possibleFavicons,
                'favicon.svg',
                false)
                .then((foundFavicon: string) => {
                    if (foundFavicon) {
                        cfg.faviconConfigMaster.masterPicture = foundFavicon;
                        appConfig.faviconConfig = appConfig.faviconConfig || 'favicon-config.json';
                    } else {
                        if (cfg.faviconConfigMaster) {
                            cfg.faviconConfigMaster.masterPicture = '';
                        }
                    }

                    return;
                });
        })
        .then(() => {
            // index
            return findFileOrDirectoryFromPossibleAsync(path.resolve(projectRoot, appConfig.root),
                ['index.html'],
                'index.html',
                false)
                .then((foundIndex: string) => {
                    if (foundIndex) {
                        appConfig.index = foundIndex;
                    }

                    return;
                });
        })
        .then(() => {
            // asp.net core
            return checkFileOrDirectoryExistsAsync(path.resolve(projectRoot, 'Views', 'Shared'), true)
                .then(exists => exists
                    ? checkFileOrDirectoryExistsAsync(path.resolve(projectRoot, 'wwwroot'), true)
                    : Promise.resolve(false));
        })
        .then(aspNet => {
            if (aspNet) {
                if (appConfig.index) {
                    delete appConfig.index;
                }
                cfg.isAspNetCore = true;
                appConfig.htmlInjectOptions = appConfig.htmlInjectOptions || {};
                appConfig.htmlInjectOptions.indexOutFileName = '../Views/Shared/_BundledScripts.cshtml';
                appConfig.htmlInjectOptions.iconsOutFileName = '../Views/Shared/_FavIcons.cshtml';
                appConfig.htmlInjectOptions.stylesOutFileName = '../Views/Shared/_BundledStyles.cshtml';
                appConfig.htmlInjectOptions
                    .customTagAttributes = [
                        { tagName: 'link', attribute: { "asp-append-version": true } },
                        { tagName: 'script', attribute: { "asp-append-version": true } }
                    ];

            }
            return;
        });
}

function mergeConfigWithAngularCli(cfg: InitConfig): void {
    if (cfg.angularBuildConfigFileExists ||
        !cfg.angularCliConfigFileExists ||
        !cfg.userAngularCliConfig ||
        !cfg.userAngularCliConfig.apps ||
        !cfg.userAngularCliConfig.apps[0]) {
        return;
    }

    const appConfig = cfg.angularBuildConfigMaster.apps[0] as any;
    const cliAppConfig = cfg.userAngularCliConfig.apps[0] as any;
    const appConfigSchema: any = schema.definitions.AppConfig.properties;

    Object.keys(cliAppConfig)
        .filter((key: string) => cfg.userAngularCliConfig[key] !== null && appConfigSchema[key] && key !== 'tsconfig')
        .forEach((key: string) => {
            appConfig[key] = cliAppConfig[key];
        });
}

function mergeConfigWithUserAngularBuildConfig(cfg: InitConfig): void {
    if (!cfg.angularBuildConfigFileExists ||
        !cfg.userAngularBuildConfig ||
        !cfg.userAngularBuildConfig.apps ||
        !cfg.userAngularBuildConfig.apps[0]) {
        return;
    }

    const masterAppConfig = cfg.angularBuildConfigMaster.apps[0] as any;
    const userAppConfig = cfg.userAngularBuildConfig.apps[0] as any;
    const appConfigSchema: any = schema.definitions.AppConfig.properties;

    Object.keys(userAppConfig)
        .filter((key: string) => appConfigSchema[key] && userAppConfig[key] !== null && userAppConfig[key] !== '')
        .forEach((key: string) => {
            masterAppConfig[key] = userAppConfig[key];
        });

}

function mergeConfigWithUserFaviconConfig(cfg: InitConfig): Promise<void> {
    const projectRoot = cfg.cwd;
    let faviconConfigPath = '';
    if (cfg.angularBuildConfigFileExists &&
        cfg.userAngularBuildConfig &&
        cfg.userAngularBuildConfig.apps &&
        cfg.userAngularBuildConfig.apps[0].faviconConfig &&
        cfg.userAngularBuildConfig.apps[0].root) {
        faviconConfigPath = path.resolve(projectRoot,
            cfg.userAngularBuildConfig.apps[0].root,
            cfg.userAngularBuildConfig.apps[0].faviconConfig);
    }

    if (!faviconConfigPath) {
        return Promise.resolve();
    }

    return checkFileOrDirectoryExistsAsync(faviconConfigPath).then((exists: boolean) => {
        cfg.faviconConfigFileExists = exists;
        if (exists) {
            return readJsonAsync(faviconConfigPath).then((faviconConfig: any) => {
                cfg.userFaviconConfig = faviconConfig;
                if (faviconConfig.masterPicture) {
                    cfg.faviconConfigMaster.masterPicture = faviconConfig.masterPicture;
                    cfg.faviconConfigMaster = Object.assign({}, cfg.faviconConfigMaster, faviconConfig);
                }
                return;
            });
        } else {
            return Promise.resolve();
        }
    }).then(() => {
        return;
    });
}

function mergeWithCommandOptions(cfg: InitConfig): void {
    const appConfig = cfg.angularBuildConfigMaster.apps[0];
    const appConfigSchema: any = schema.definitions.AppConfig.properties;

    Object.keys(cfg.commandOptions).forEach((key: string) => {
        const commandOptions: any = cfg.commandOptions;
        if (typeof commandOptions[key] !== 'undefined' &&
            commandOptions[key] !== null &&
            (!Array.isArray(commandOptions[key]) ||
                (Array.isArray(commandOptions[key]) && commandOptions[key].find((s: any) => s !== null))) &&
            key !== 'extends' &&
            appConfigSchema[key]) {
            const obj = appConfig as any;
            if (appConfigSchema[key].type === 'boolean') {
                obj[key] = commandOptions[key].toString().toLowerCase() === 'true';
            } else {
                obj[key] = commandOptions[key];
            }
        }
    });
}

function mergeConfigWithPromptAsync(cfg: InitConfig): Promise<void> {
    const projectRoot = cfg.cwd;
    const appConfig = cfg.angularBuildConfigMaster.apps[0];

    return Promise.resolve(cfg.angularBuildConfigFileExists)
        .then((exists: boolean) => {
            if (exists) {
                if (cfg.commandOptions.overrideAngularBuildConfigFile) {
                    return Promise.resolve();
                }
                return askAsync(chalk.bgYellow('WARNING:') +
                    ` Override 'angular-build.json' yes/no ('no')?: `)
                    .then((answer: string) => {
                        if (answer &&
                            answer.trim() &&
                            (answer.trim().toLowerCase() === 'yes' ||
                                answer.trim().toLowerCase() === 'y')) {
                            cfg.commandOptions.overrideAngularBuildConfigFile = true;
                        }
                    });
            } else {
                return Promise.resolve();
            }
        })
        .then(() => {
            const possibleWebpackFiles = [
                'webpackfile.ts', 'webpackfile.babel.js', 'webpackfile.js', 'webpack.config.ts',
                'webpack.config.babel.js',
                'webpack.config.js'
            ];
            if (cfg.commandOptions.webpackConfigFileName && possibleWebpackFiles.indexOf(cfg.commandOptions.webpackConfigFileName) === -1) {
                possibleWebpackFiles.unshift(cfg.commandOptions.webpackConfigFileName);
            }

            return findFileOrDirectoryFromPossibleAsync(projectRoot,
                possibleWebpackFiles,
                cfg.commandOptions.webpackConfigFileName || 'webpack.config.js').then((foundName: string) => {
                    if (foundName && (!cfg.commandOptions.webpackConfigFileName || foundName === cfg.commandOptions.webpackConfigFileName)) {
                        cfg.webpackConfigFileExists = true;
                        cfg.commandOptions.webpackConfigFileName = foundName;
                        if (cfg.commandOptions.overrideWebpackConfigFile) {
                            return Promise.resolve();
                        }
                        return askAsync(chalk.bgYellow('WARNING:') +
                            ` Override '${foundName}' yes/no (yes)?: `)
                            .then((answer: string) => {
                                if (answer &&
                                    answer.trim() &&
                                    (answer.trim().toLowerCase() === 'no' ||
                                        answer.trim().toLowerCase() === 'n')) {
                                    cfg.commandOptions.overrideWebpackConfigFile = false;
                                } else {
                                    cfg.commandOptions.overrideWebpackConfigFile = true;
                                }
                            });
                    } else {
                        return Promise.resolve();
                    }
                });
        })
        .then(() => {
            if (cfg.commandOptions.root ||
                (cfg.angularBuildConfigFileExists && !cfg.commandOptions.overrideAngularBuildConfigFile)) {
                return Promise.resolve();
            }
            return askAsync(`Enter client app root folder ${appConfig.root ? `(${appConfig.root})` : ''}: `)
                .then((answer: string) => {
                    if (answer && answer.trim()) {
                        appConfig.root = answer.trim();
                    }
                });
        })
        .then(() => {
            if (cfg.commandOptions.outDir ||
                (cfg.angularBuildConfigFileExists && !cfg.commandOptions.overrideAngularBuildConfigFile)) {
                return Promise.resolve();
            }
            return askAsync(`Enter build output folder ${appConfig.outDir ? `(${appConfig.outDir})` : ''}: `)
                .then((answer: string) => {
                    if (answer && answer.trim()) {
                        appConfig.outDir = answer.trim();
                    }
                });
        })
        .then(() => {
            if (cfg.commandOptions.publicPath ||
                (cfg.angularBuildConfigFileExists && !cfg.commandOptions.overrideAngularBuildConfigFile)) {
                return Promise.resolve();
            }
            return askAsync(`Enter public path ${appConfig.publicPath ? `(${appConfig.publicPath})` : ''}: `)
                .then((answer: string) => {
                    if (answer && answer.trim()) {
                        appConfig.publicPath = answer.trim();
                        if (!appConfig.publicPath.endsWith('/')) {
                            appConfig.publicPath += '/';
                        }
                    }
                });
        })
        .then(() => {
            if (cfg.commandOptions.main ||
                (cfg.angularBuildConfigFileExists && !cfg.commandOptions.overrideAngularBuildConfigFile)) {
                return Promise.resolve();
            }
            return askAsync(`Enter app bootstrap main file ${appConfig.main ? `(${appConfig.main})` : ''}: `)
                .then((answer: string) => {
                    if (answer && answer.trim()) {
                        appConfig.main = answer.trim();
                    }
                });
        })
        .then(() => { return; });
}

function checkAndInstallToolings(cfg: InitConfig): Promise<void> {
    const projectRoot = cfg.cwd;
    if (typeof cfg.commandOptions.installLoadersOnly === 'undefined') {
        cfg.commandOptions.installLoadersOnly = cfg.commandOptions.linkCli;
    }
    const installLoadersOnly = cfg.commandOptions.installLoadersOnly;

    const preReleasedPackageNames = [
        'extract-text-webpack-plugin'
    ];

    const peerDeps = [
        '@types/node',
        'cross-env',
        'rimraf',
        'typescript',
        'ts-node',
        'tslib',
        'tslint',
        'webpack',
        'webpack-dev-server',
        'webpack-hot-middleware'
    ];

    const loaderDeps = [
        '@angular/compiler-cli',
        '@angular/compiler',
        '@angular/core',
        '@ngtools/webpack',
        'less',
        'node-sass',
        'stylus'
    ];

    const angularMinimalDeps = [
        '@angular/common',
        '@angular/forms',
        '@angular/http',
        '@angular/router',
        '@angular/platform-browser',
        '@angular/platform-browser-dynamic',
        '@angular/platform-server',

        'core-js',
        'rxjs',
        'zone.js'
    ];

    const depsSaveFilteredList = [
        'es6-promise',
        'es6-shim',
        'ie-shim',
        'reflect-metadata',
        'rxjs',
        'core-js',
        'ts-helpers',
        'tslib',
        'zone.js',
        '@angular/compiler',
        '@angular/core'
    ];

    const depsToInstall: string[] = [];

    const depPackages: PackageToCheck[] = Object.keys(cfg.cliPackageJsonConfig.dependencies)
        .filter((key: string) => !installLoadersOnly || (installLoadersOnly && key.match(/loader$/)))
        .map((key: string) => {
            const ver = cfg.cliPackageJsonConfig.dependencies[key];
            const isPreReleased = !(preReleasedPackageNames.indexOf(key) === -1);
            return {
                packageName: key,
                version: ver,
                isPreReleased: isPreReleased
            };
        });


    return checkPackagesToInstall(peerDeps, projectRoot)
        .then((packageNames: string[]) => {
            packageNames.forEach((pkgName: string) => {
                if (depsToInstall.indexOf(pkgName) === -1) {
                    depsToInstall.push(pkgName);
                }
            });
        })
        .then(() => {
            if (cfg.cliIsLocal) {
                return Promise.resolve();
            }

            return checkPackagesToInstall(depPackages, projectRoot)
                .then((packageNames: string[]) => {
                    packageNames.forEach((pkgName: string) => {
                        if (depsToInstall.indexOf(pkgName) === -1) {
                            depsToInstall.push(pkgName);
                        }
                    });
                });
        })
        .then(() => {
            if (cfg.cliIsLocal) {
                return Promise.resolve();
            }

            return checkPackagesToInstall(loaderDeps, projectRoot)
                .then((packageNames: string[]) => {
                    packageNames.forEach((pkgName: string) => {
                        if (depsToInstall.indexOf(pkgName) === -1) {
                            depsToInstall.push(pkgName);
                        }
                    });
                });
        })
        .then(() => {
            if (depsToInstall.indexOf('@angular/core') > -1) {
                depsToInstall.push(...angularMinimalDeps);
            }

            if (depsToInstall.length) {
                console.log('Installing packages for tooling via npm...');
                const installedPackages: string[] = [];
                const depsToSave: string[] = [];
                const devDepsToSave: string[] = [];
                depsToInstall.forEach(p => {
                    if (depsSaveFilteredList.indexOf(p) > -1) {
                        depsToSave.push(p);
                    } else {
                        devDepsToSave.push(p);
                    }
                });

                return Promise.resolve(0).then(() => {
                        if (!depsToSave.length) {
                            return Promise.resolve();
                        }
                        return spawnAsync('npm',
                                ['install', '-S', '--color', 'always', '--loglevel', 'error']
                                .concat(depsToSave))
                            .then(() => {
                                installedPackages.push(...depsToSave);
                                return;
                            });
                    })
                    .then(() => {
                        if (!devDepsToSave.length) {
                            return Promise.resolve();
                        }
                        return spawnAsync('npm',
                                ['install', '-D', '--color', 'always', '--loglevel', 'error']
                                .concat(devDepsToSave))
                            .then(() => {
                                installedPackages.push(...devDepsToSave);
                                return;
                            });
                    })
                    .then(() => {
                        if (installedPackages.length) {
                            console.log(chalk.green(installedPackages.join('\n')));
                        }
                        console.log('Packages were installed.\n');
                        return;
                    });
            } else {
                return Promise.resolve();
            }
        });
}

function checkPackagesToInstall(packagesToCheck: (PackageToCheck|string)[], projectRoot: string): Promise<string[]> {
    const tasks = packagesToCheck.map((pkgToCheck: PackageToCheck | string) => {
        const pkgToCheckObj: PackageToCheck = typeof pkgToCheck === 'string' ? { packageName: pkgToCheck } : pkgToCheck;
        return new Promise(res => {
            resolve(pkgToCheckObj.packageName,
                { basedir: projectRoot },
                (error, resolvedPath) => {
                    if (error) {
                        res(pkgToCheckObj);
                    } else {
                        pkgToCheckObj.resolvedPath = resolvedPath;
                        res(pkgToCheckObj);
                    }
                });
        }).then((packageObj: any) => {
            if (packageObj.resolvedPath) {
                if (packageObj.version) {
                    const versionRange = semver.validRange(packageObj.version);
                    return getVersionfromPackageJsonAsync(path
                        .resolve(projectRoot, 'node_modules', packageObj.packageName)).then((localVer: string) => {
                            if (localVer && semver.satisfies(localVer, versionRange)) {
                                return null;
                            }
                            if (packageObj.isPreReleased) {
                                return packageObj.packageName + '@' + packageObj.version;
                            } else {
                                return packageObj.packageName;
                            }
                        });
                } else {
                    return Promise.resolve(null);
                }
            } else {
                if (packageObj.packageName.match(/^@types\//)) {
                    return checkFileOrDirectoryExistsAsync(path
                        .resolve(projectRoot, 'node_modules', packageObj.packageName),
                        true)
                        .then((exists: boolean) => {
                            return exists ? null : packageObj.packageName;
                        });
                }
                if (packageObj.isPreReleased && packageObj.version) {
                    return Promise.resolve(packageObj.packageName + '@' + packageObj.version);
                } else {
                    return Promise.resolve(packageObj.packageName);
                }
            }
        });
    });

    return Promise.all(tasks).then(packages => packages.filter(p => p !== null));
}