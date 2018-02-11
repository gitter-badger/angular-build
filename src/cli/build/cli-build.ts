import * as path from 'path';
import * as webpack from 'webpack';

import {
    InternalError,
    InvalidConfigError,
    ProjectConfigInternal,
    TypescriptCompileError,
    UglifyError,
    UnSupportedStyleExtError
} from '../../models';
import { runWebpack } from '../../helpers/run-webpack';
import { Logger } from '../../utils/logger';
import { getWebpackConfig } from '../../webpack-configs';

import { CliOptions } from '../cli-options';

const { exists } = require('fs-extra');

export async function cliBuild(cliOptions: CliOptions): Promise<number> {
    const startTime = cliOptions.startTime || Date.now();

    const cliIsGlobal = cliOptions.cliIsGlobal;
    const cliRootPath = cliOptions.cliRootPath;
    const commandOptions: { [key: string]: any } =
        cliOptions.commandOptions && typeof cliOptions.commandOptions === 'object' ? cliOptions.commandOptions : {};
    commandOptions.fromAngularBuildCli = true;
    commandOptions.cliIsGlobal = cliIsGlobal;
    commandOptions.cliRootPath = cliRootPath;

    let configPath = '';
    if (commandOptions.config) {
        configPath = path.isAbsolute(commandOptions.config)
            ? path.resolve(commandOptions.config)
            : path.resolve(process.cwd(), commandOptions.config);
    } else {
        configPath = path.resolve(process.cwd(), 'angular-build.json');
    }

    let watch = commandOptions.watch ? true : false;
    let environment =
        commandOptions.env && typeof commandOptions.env === 'object' ? commandOptions.env : {};

    const logger = new Logger({
        logLevel: 'debug',
        debugPrefix: 'DEBUG:',
        warnPrefix: 'WARNING:'
    });

    if (!await exists(configPath)) {
        logger.error(`The angular-build.json config file does not exist at ${configPath}.`);
        return -1;
    }

    let webpackConfigs: webpack.Configuration[] = [];
    try {
        webpackConfigs = getWebpackConfig(configPath, environment, commandOptions);
    } catch (e) {
        if (e instanceof InvalidConfigError ||
            e instanceof InternalError) {
            logger.error(`\n${e.message}`);
            return -1;
        }
        throw e;
    }

    if (webpackConfigs.length === 0) {
        logger.error(`\nNo app or lib project is available.`);
        return -1;
    }

    try {
        if (watch) {
            for (let wpConfig of webpackConfigs) {
                delete (wpConfig as any)._projectConfig;
            }

            await runWebpack(webpackConfigs, watch, logger);
        } else {
            for (let wpConfig of webpackConfigs) {
                const mappedConfig = (wpConfig as any)._projectConfig as ProjectConfigInternal;
                logger.info(`Processing ${mappedConfig.name
                    ? mappedConfig.name
                    : mappedConfig._projectType + 's[' + mappedConfig._index + ']'}`);
                delete (wpConfig as any)._projectConfig;
                await runWebpack(wpConfig, false, logger);
            }
        }

        logger.info(`\nBuild all completed in [${Date.now() - startTime}ms]`);
        if (commandOptions.beep && process.stdout.isTTY) {
            process.stdout.write('\x07');
        }

        return 0;
    } catch (err) {
        if (!err) {
            return -1;
        }

        if (err instanceof InvalidConfigError ||
            err instanceof TypescriptCompileError ||
            err instanceof UglifyError ||
            err instanceof UnSupportedStyleExtError) {
            logger.error(`\n${err.message}`);
        } else {
            let errMsg = '\n';
            if (err.message && err.message.length && err.message !== err.stack) {
                errMsg += err.message;
            }
            if ((err as any).details &&
                (err as any).details.length &&
                (err as any).details !== err.stack &&
                (err as any).details !== err.message) {
                if (errMsg.trim()) {
                    errMsg += '\nError Details:\n';
                }
                errMsg += (err as any).details;
            }
            if (err.stack && err.stack.length && err.stack !== err.message) {
                if (errMsg.trim()) {
                    errMsg += '\nCall Stack:\n';
                }
                errMsg += err.stack;
            }

            logger.error(errMsg);
        }

        if (commandOptions.beep && process.stdout.isTTY) {
            process.stdout.write('\x07');
        }
        return -1;
    }
}