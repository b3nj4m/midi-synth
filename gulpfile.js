var browserify = require('browserify');
var watchify = require('watchify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var statics = require('serve-static');
var express = require('express');
var gutil = require('gulp-util');

gulp.task('scripts', function() {
  var bundler = watchify(browserify(['demo.js'], watchify.args));

  function bundle() {
    return bundler.bundle()
      .on('error', function(err) { console.error(err, err.stack); })
      .pipe(source('demo-built.js'))
      .pipe(gulp.dest('./'));
  }

  bundler.on('update', bundle);
  bundler.on('log', gutil.log.bind(gutil));

  return bundle();
});

gulp.task('serve', function() {
  var app = express();
  var port = parseInt(gutil.env.port) || 8080;

  app.use(statics('.'));
  app.listen(port);

  gutil.log('serving http on port', port);
});

gulp.task('default', ['scripts', 'serve']);
