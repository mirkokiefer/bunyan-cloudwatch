
var util = require('util');
var Writable = require('stream').Writable;
var AWS = require('aws-sdk');

module.exports = createCloudWatchStream;

function createCloudWatchStream(opts) {
  return new CloudWatchStream(opts);
}

util.inherits(CloudWatchStream, Writable);
function CloudWatchStream(opts) {
  Writable.call(this, {objectMode: true});
  this.logGroupName = opts.logGroupName;
  this.logStreamName = opts.logStreamName;
  this.writeInterval = opts.writeInterval || 0;

  var config = {
    region: opts.region,
    // Allow passing AWS credentials as explicit values instead of always relying on env vars
    credentials: {
      accessKeyId: opts.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: opts.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
    }
  }

  AWS.config.update(config);

  this.cloudwatch = new AWS.CloudWatchLogs();
  this.queuedLogs = [];
  this.sequenceToken = null;
  this.writeQueued = false;
}

CloudWatchStream.prototype._write = function (record, _enc, cb) {
  this.queuedLogs.push(record);
  if (!this.writeQueued) {
    this.writeQueued = true;
    setTimeout(this._writeLogs.bind(this), this.writeInterval);
  }
  cb();
}

CloudWatchStream.prototype._writeLogs = function () {
  if (this.sequenceToken === null) {
    return this._getSequenceToken(this._writeLogs.bind(this));
  }
  var log = {
    logGroupName: this.logGroupName,
    logStreamName: this.logStreamName,
    sequenceToken: this.sequenceToken,
    logEvents: this.queuedLogs.map(createCWLog)
  };
  this.queuedLogs = [];
  var obj = this;
  this.cloudwatch.putLogEvents(log, function (err, res) {
    if (err) {
      return obj._error(err);
    }
    obj.sequenceToken = res.nextSequenceToken;
    if (obj.queuedLogs.length) {
      return obj._writeLogs();
    }
    obj.writeQueued = false;
  });
}

CloudWatchStream.prototype._getSequenceToken = function (done) {
  var params = {
    logGroupName: this.logGroupName,
    logStreamNamePrefix: this.logStreamName
  };
  var obj = this;
  this.cloudwatch.describeLogStreams(params, function(err, data) {
    if (err) {
      if (err.name === 'ResourceNotFoundException') {
        createLogGroupAndStream(obj.cloudwatch, obj.logGroupName, obj.logStreamName, createStreamCb);
        return;
      }
      return obj._error(err);
    }
    if (data.logStreams.length == 0) {
      createLogStream(obj.cloudwatch, obj.logGroupName, obj.logStreamName, createStreamCb);
      return;
    }
    obj.sequenceToken = data.logStreams[0].uploadSequenceToken;
    done();
  });

  function createStreamCb(err, res) {
    if (err) return obj._error(err);
    // call again to verify stream was created - silently fails sometimes!
    obj._getSequenceToken(done);
  }
}

CloudWatchStream.prototype._error = function (err) {
  if (this.onError) return this.onError(err);
  throw err;
}

function createLogGroupAndStream(cloudwatch, logGroupName, logStreamName, cb) {
  cloudwatch.createLogGroup({
    logGroupName: logGroupName
  }, function (err) {
    if (err) return err;
    createLogStream(cloudwatch, logGroupName, logStreamName, cb);
  });
}

function createLogStream(cloudwatch, logGroupName, logStreamName, cb) {
  cloudwatch.createLogStream({
    logGroupName: logGroupName,
    logStreamName: logStreamName
  }, cb);
}

function createCWLog(bunyanLog) {
  var message = {};
  for (var key in bunyanLog) {
    if (key === 'time') continue;
    message[key] = bunyanLog[key];
  }
  var log = {
    message: JSON.stringify(message),
    timestamp: new Date(bunyanLog.time).getTime()
  };
  return log;
}


function BunyanCWError(message) {
  this.name = 'BunyanCWError';
  this.message = message || 'error in bunyan-cloudwatch';
}
BunyanCWError.prototype = Object.create(Error.prototype);
BunyanCWError.prototype.constructor = BunyanCWError;
