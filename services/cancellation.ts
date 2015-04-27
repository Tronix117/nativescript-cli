///<reference path="../../.d.ts"/>
"use strict";

var gaze = require("gaze");
import path = require("path");
import os = require("os");
var options: any = require("../options");
import Future = require("fibers/future");

export class CancellationService implements ICancellationService {
	private watches: IDictionary<IWatcherInstance> = {};

	constructor(private $fs: IFileSystem,
			private $logger: ILogger,
			private $errors: IErrors) {
		this.$fs.createDirectory(CancellationService.killSwitchDir).wait();
		this.$fs.chmod(CancellationService.killSwitchDir, "0777").wait();
	}

	public begin(name: string): IFuture<void> {
		return (() => {
			var triggerFile = CancellationService.makeKillSwitchFileName(name);

			var stream = this.$fs.createWriteStream(triggerFile);
			var streamEnd = this.$fs.futureFromEvent(stream, "finish");
			stream.end();
			streamEnd.wait();
			this.$fs.chmod(triggerFile, "0777").wait();

			this.$logger.trace("Starting watch on killswitch %s", triggerFile);

			var watcherInitialized = new Future<IWatcherInstance>();

			gaze(triggerFile, function(err: any, watcher: any) {
				this.on("deleted", (filePath: string) => process.exit());
				if(err) {
					watcherInitialized.throw(err);
				} else {
					watcherInitialized.return(watcher);
				}
			});

			var watcher = watcherInitialized.wait();

			if (watcher) {
				this.watches[name] = watcher;
			}
		}).future<void>()();
	}

	public end(name: string): void {
		var watcher = this.watches[name];
		delete this.watches[name];
		watcher.close();
	}

	public dispose(): void {
		Object.keys(this.watches).forEach((name) => {
			this.end(name);
		})
	}

	private static get killSwitchDir(): string {
		return path.join(os.tmpdir(), process.env.SUDO_USER || process.env.USER || process.env.USERNAME, "KillSwitches");
	}

	private static makeKillSwitchFileName(name: string): string {
		return path.join(CancellationService.killSwitchDir, name);
	}
}
$injector.register("cancellation", CancellationService);