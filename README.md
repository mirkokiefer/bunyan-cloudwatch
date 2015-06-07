#bunyan-cloudwatch

Stream to write [bunyan](https://github.com/trentm/node-bunyan) logs to [AWS CloudWatch](http://aws.amazon.com/cloudwatch/).

This is actually a plain [Node.js Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable) object stream so could be used without bunyan.

##Usage

``` js
var bunyan = require('bunyan');
var createCWStream = require('bunyan-cloudwatch');

var stream = bunyanCW({
  logGroupName: 'my-group',
  logStreamName: 'my-stream',
  region: 'us-west-1'
});

var log = bunyan.createLogger({
  name: 'foo',
  streams: [
    {
      stream: stream,
      type: 'raw'
    }
  ]
});
```

##API

###createCWStream(opts)
With `opts` of:

- `logGroupName` (required)
- `logStreamName` (required)
- `region` (required): the AWS region e.g. `us-west-1`
- `writeInterval` (optional, default: `0`): allows configuring the write interval to CloudWatch

On write of the first log, the module creates the logGroup and logStream if necessary.

We use the aws-sdk to write the logs - the AWS credentials have therefore to be configured using environment variables (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).

- [Configuring the aws-sdk](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html)
- [`CloudWatchLogs.putLogEvents`](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) is the method we use to write logs

##Contributors
This project was created by Mirko Kiefer ([@mirkokiefer](https://github.com/mirkokiefer)).