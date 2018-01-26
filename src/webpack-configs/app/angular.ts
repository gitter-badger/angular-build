﻿import * as path from 'path';

import * as resolve from 'resolve';
import * as webpack from 'webpack';

import {
    AotPlugin,
    AotPluginOptions,
    AngularCompilerPlugin,
    AngularCompilerPluginOptions,
    PLATFORM
} from '@ngtools/webpack';

import {
    AppBuildContext,
    AppProjectConfigInternal,
    InvalidConfigError,
    ModuleReplacementEntry
} from '../../models';
import { isWebpackDevServer } from '../../helpers';

const { CheckerPlugin, TsConfigPathsPlugin } = require('awesome-typescript-loader');

/**
 * Enumerate loaders and their dependencies from this file to let the dependency validator
 * know they are used.
 * require('angular2-template-loader')
 * require('angular-router-loader')
 * require('awesome-typescript-loader')
 * require('cache-loader')
 * require('@angular-devkit/build-optimizer')
 */

export function getAppAngularTypescriptWebpackConfigPartial(angularBuildContext: AppBuildContext): webpack.Configuration {
    const appConfig = angularBuildContext.projectConfig as AppProjectConfigInternal;
    if (!appConfig.entry) {
        return {};
    }

    if (appConfig.useLegacyTsLoader) {
        return getAngularLegacyTypescriptWebpackConfigPartial(angularBuildContext);
    }

    return getAngularPluginWebpackConfigPartial(angularBuildContext);
}

export function getAngularFixPlugins(angularBuildContext: AppBuildContext): webpack.Plugin[] {
    const projectRoot = angularBuildContext.projectRoot;
    const appConfig = angularBuildContext.projectConfig as AppProjectConfigInternal;

    const srcDir = path.resolve(projectRoot, appConfig.srcDir || '');

    const angularFixPlugins: webpack.Plugin[] = [
        // fixes WARNING Critical dependency: the request of a dependency is an expression
        new webpack.ContextReplacementPlugin(
            /angular(\\|\/)core(\\|\/)(@angular|esm.+)/,
            srcDir
        ),

        // fixes WARNING Critical dependency: the request of a dependency is an expression
        new webpack.ContextReplacementPlugin(
            /(.+)?express(\\|\/)(.+)?/,
            srcDir
        )
    ];

    // TODO: to review
    if (appConfig._nodeResolveFields &&
        appConfig._nodeResolveFields.length &&
        appConfig._nodeResolveFields[0] === 'main') {
        // Workaround for https://github.com/angular/angular/issues/11580
        angularFixPlugins.push(
            new webpack.ContextReplacementPlugin(
                /\@angular\b.*\b(bundles|linker)/,
                srcDir
            )
        );
    }

    return angularFixPlugins;
}

function getAngularLegacyTypescriptWebpackConfigPartial(angularBuildContext: AppBuildContext): webpack.Configuration {
    const appConfig = angularBuildContext.projectConfig as AppProjectConfigInternal;
    const cliIsGlobal = angularBuildContext.cliIsGlobal;
    const environment = angularBuildContext.environment;
    const projectRoot = angularBuildContext.projectRoot;

    if (!appConfig.entry) {
        return {};
    }

    const tsConfigFilePath = appConfig._tsConfigPath;

    if (!appConfig.tsconfig && !tsConfigFilePath) {
        throw new InvalidConfigError(
            `The '${appConfig._projectType}s[${appConfig._index
            }].tsconfig' value is required.`);
    }

    if (!tsConfigFilePath) {
        throw new InvalidConfigError(
            `Invalid tsconfig entry at '${appConfig._projectType}s[${appConfig._index
            }].tsconfig'.`);
    }


    const plugins: webpack.Plugin[] = [];

    let exclude = [/\.(spec|e2e|e2e-spec|test)\.ts$/];

    const tsLoader = cliIsGlobal ? require.resolve('awesome-typescript-loader') : 'awesome-typescript-loader';
    const ngTemplateLoader = cliIsGlobal ? require.resolve('angular2-template-loader') : 'angular2-template-loader';
    const ngRouterLoader = cliIsGlobal ? require.resolve('angular-router-loader') : 'angular-router-loader';

    // rules
    const rules: webpack.Rule[] = [
        {
            test: /\.ts$/,
            use: [
                {
                    loader: tsLoader,
                    options: {
                        instance: `at-${appConfig.name || 'app'}-loader`,
                        configFileName: tsConfigFilePath
                    }
                },
                {
                    loader: ngTemplateLoader
                }
            ],
            exclude: exclude
        },
        {
            test: /\.(ts|js)$/,
            loaders: [ngRouterLoader]
        }
    ];

    // angularFixPlugins
    const angularFixPlugins = getAngularFixPlugins(angularBuildContext);
    plugins.push(...angularFixPlugins);

    // CheckerPlugin
    if (!environment.dll) {
        plugins.push(new CheckerPlugin());
    }

    // replace environment
    const hostReplacementPaths = getHostReplacementPaths(projectRoot, appConfig);
    if (hostReplacementPaths) {
        Object.keys(hostReplacementPaths).forEach((key: string) => {
            const resourcePath = key;
            const newResourcePath = hostReplacementPaths[key];

            // // Since it takes a RegExp as first parameter, we need to escape the path.
            const escapedPath = resourcePath
                .replace(/\\/g, '/')
                .replace(/[\-\[\]\{\}\(\)\*\+\?\.\^\$]/g, '\\$&')
                .replace(/\//g, `(\\\\|\\/)`);
            plugins.push(new webpack.NormalModuleReplacementPlugin(new RegExp(escapedPath), newResourcePath));
        });
    }

    return {
        resolve: {
            plugins: [
                new TsConfigPathsPlugin({
                    configFileName: tsConfigFilePath
                })
            ]
        },
        module: {
            rules: rules
        },
        plugins: plugins
    };
}

function getAngularPluginWebpackConfigPartial(angularBuildContext: AppBuildContext): webpack.Configuration {
    const appConfig = angularBuildContext.projectConfig as AppProjectConfigInternal;
    const cliIsGlobal = angularBuildContext.cliIsGlobal;
    const environment = angularBuildContext.environment;
    const projectRoot = angularBuildContext.projectRoot;

    if (!appConfig.entry) {
        return {};
    }

    const tsConfigFilePath = appConfig._tsConfigPath;

    if (!appConfig.tsconfig && !tsConfigFilePath) {
        throw new InvalidConfigError(
            `The '${appConfig._projectType}s[${appConfig._index
            }].tsconfig' value is required.`);
    }

    if (!tsConfigFilePath) {
        throw new InvalidConfigError(
            `Invalid tsconfig entry at '${appConfig._projectType}s[${appConfig._index
            }].tsconfig'.`);
    }

    const exclude = ['**/*.spec.ts', '**/*.e2e.ts', '**/*.e2e-spec.ts', '**/test.ts', '**/*.test.ts'];

    const ngToolsWebpackLoader = cliIsGlobal ? require.resolve('@ngtools/webpack') : '@ngtools/webpack';

    let boLoaders: any = [];
    const rules: webpack.Rule[] = [];

    // build-optimizer/webpack-loader
    if (environment.prod && environment.aot && appConfig.platformTarget !== 'node' && !isWebpackDevServer()) {
        const buildOptimizerLoader = cliIsGlobal
            ? require.resolve('@angular-devkit/build-optimizer/webpack-loader')
            : '@angular-devkit/build-optimizer/webpack-loader';
        const cacheLoader = cliIsGlobal
            ? require.resolve('cache-loader')
            : 'cache-loader';

        boLoaders = [
            {
                loader: buildOptimizerLoader,
                options: { sourceMap: appConfig.sourceMap }
            }
        ];

        // Set the cache directory to the Build Optimizer dir, so that package updates will delete it.
        const buildOptimizerDir = path.dirname(
            resolve.sync('@angular-devkit/build-optimizer', { basedir: projectRoot }));
        const cacheDirectory = path.resolve(buildOptimizerDir, './.cache/');

        rules.push({
            test: /\.js$/,
            use: [
                {
                    loader: cacheLoader,
                    options: { cacheDirectory }
                },
                {
                    loader: buildOptimizerLoader,
                    options: { sourceMap: appConfig.sourceMap }
                }
            ]
        });
    }

    const tsLoaderTestRegex = environment.aot && AngularCompilerPlugin.isSupported()
        ? /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/
        : /\.ts$/;

    rules.push({
        test: tsLoaderTestRegex,
        use: [...boLoaders, ngToolsWebpackLoader]
    });

    const aotOptions: any = {
        exclude
    };

    if (!environment.aot) {
        aotOptions.skipCodeGeneration = true;
    }

    const plugins: webpack.Plugin[] = [
        createAotPlugin(angularBuildContext, aotOptions)
    ];

    // TODO: to reivew for platformTarget === 'node'
    if (appConfig.platformTarget === 'node' ||
        (appConfig._nodeResolveFields &&
            appConfig._nodeResolveFields.length &&
            appConfig._nodeResolveFields[0] === 'main')) {
        const angularFixPlugins = getAngularFixPlugins(angularBuildContext);
        plugins.push(...angularFixPlugins);
    }

    return {
        module: {
            rules: rules
        },
        plugins: plugins
    };
}

function createAotPlugin(angularBuildContext: AppBuildContext,
    options: AotPluginOptions | AngularCompilerPluginOptions): webpack.Plugin {
    const projectRoot = angularBuildContext.projectRoot;
    const appConfig = angularBuildContext.projectConfig as AppProjectConfigInternal;

    if (!appConfig.entry) {
        throw new InvalidConfigError(
            `The '${appConfig._projectType}s[${appConfig._index
            }].entry' value is required.`);
    }

    options.compilerOptions = options.compilerOptions || {};

    const hostReplacementPaths = getHostReplacementPaths(projectRoot, appConfig);

    if (AngularCompilerPlugin.isSupported()) {
        const pluginOptions: AngularCompilerPluginOptions = Object.assign({},
            {
                tsConfigPath: appConfig._tsConfigPath,
                mainPath: path.join(projectRoot, appConfig.srcDir || '', appConfig.entry),
                i18nFile: appConfig.i18nFile,
                i18nFormat: appConfig.i18nFormat,
                i18nOutFile: appConfig.i18nOutFile,
                i18nOutFormat: appConfig.i18nOutFormat,
                locale: appConfig.locale,
                platform: appConfig.platformTarget === 'node' ? PLATFORM.Server : PLATFORM.Browser,
                missingTranslation: appConfig.missingTranslation,
                hostReplacementPaths: hostReplacementPaths,
                sourceMap: appConfig.sourceMap
            }, options);
        return new AngularCompilerPlugin(pluginOptions);
    } else {
        const pluginOptions: AotPluginOptions = Object.assign({},
            {
                tsConfigPath: appConfig._tsConfigPath,
                // IMPORTANT
                // If not specifed mainPath and angularCompilerOptions, awesome error occurs:
                // ERROR in Cannot read property 'split' of undefined
                mainPath: path.join(projectRoot, appConfig.srcDir || '', appConfig.entry),
                i18nFile: appConfig.i18nFile,
                i18nFormat: appConfig.i18nFormat,
                locale: appConfig.locale,
                replaceExport: appConfig.platformTarget === 'node',
                missingTranslation: appConfig.missingTranslation,
                hostReplacementPaths: hostReplacementPaths,
                sourceMap: appConfig.sourceMap,
                // If we don't explicitely list excludes, it will default to `['**/*.spec.ts']`.
                exclude: []
            },
            options);
        return new AotPlugin(pluginOptions);
    }

}

function getHostReplacementPaths(projectRoot: string, appConfig: AppProjectConfigInternal): { [key: string]: string } {
    const hostReplacementPaths: { [key: string]: string } = {};
    if (appConfig.moduleReplacements) {
        appConfig.moduleReplacements.forEach((entry: ModuleReplacementEntry) => {
            const root = path.resolve(projectRoot, appConfig.srcDir || '');
            const resourcePath = path.resolve(root, entry.resourcePath);
            const newResourcePath = path.resolve(root, entry.newResourcePath);
            if (resourcePath !== newResourcePath) {
                hostReplacementPaths[resourcePath] = newResourcePath;
            }
        });
    }

    return hostReplacementPaths;
}