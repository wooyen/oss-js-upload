'use strict';
(function () {

  var detectIEVersion = function () {
    var v = 4,
        div = document.createElement('div'),
        all = div.getElementsByTagName('i');
    while (
        div.innerHTML = '<!--[if gt IE ' + v + ']><i></i><![endif]-->',
            all[0]
        ) {
      v++;
    }
    return v > 4 ? v : false;
  };

  var _extend = function (dst, src) {
    for (var i in src) {
      if (Object.prototype.hasOwnProperty.call(src, i) && src[i]) {
        dst[i] = src[i];
      }
    }
  };

  function OssUpload(config) {
    if (!config) {
      // console.log('需要 config');
      return;
    }
    this._config = {
      chunkSize: 1048576    // 1MB
    };

    if (this._config.chunkSize && this._config.chunkSize < 102400) {
      // console.log('chunkSize 不能小于 100KB');
      return;
    }

    _extend(this._config, config);

    if (!this._config.aliyunCredential && !this._config.stsToken) {
      // console.log('需要 stsToken');
      return;
    }

    if (!this._config.endpoint) {
      // console.log('需要 endpoint');
      return;
    }

    var ALY = window.ALY;
    if (this._config.stsToken) {
      this.oss = new ALY.OSS({
        accessKeyId: this._config.stsToken.Credentials.AccessKeyId,
        secretAccessKey: this._config.stsToken.Credentials.AccessKeySecret,
        securityToken: this._config.stsToken.Credentials.SecurityToken,
        endpoint: this._config.endpoint,
        apiVersion: '2013-10-15'
      });
    }
    else {
      this.oss = new ALY.OSS({
        accessKeyId: this._config.aliyunCredential.accessKeyId,
        secretAccessKey: this._config.aliyunCredential.secretAccessKey,
        endpoint: this._config.endpoint,
        apiVersion: '2013-10-15'
      });
    }

    var arr = this._config.endpoint.split('://');
    if (arr.length < 2) {
      // console.log('endpoint 格式错误');
      return;
    }
    this._config.endpoint = {
      protocol: arr[0],
      host: arr[1]
    }

  }

	OssUpload.prototype.upload = function (options) {
		if (!options) {
		  if (typeof options.onerror == 'function') {
			options.onerror('需要 options');
		  }
		  return;
		}

		if (!options.file) {
		  if (typeof options.onerror == 'function') {
			options.onerror('需要 file');
		  }
		  return;
		}
		var file = options.file;

		if (!options.key) {
		  if (typeof options.onerror == 'function') {
			options.onerror('需要 key');
		  }
		  return;
		}
		// 去掉 key 开头的 /
		options.key.replace(new RegExp("^\/"), '');
		
		var callback = function(err, res, progress) {
			if (err) {
				if (typeof options.onerror == 'function') {
					options.onerror(err);
				}
				return;
			}
			if (res) {
				if (typeof options.oncomplete == 'function') {
					options.oncomplete(res);
				}
				return;
			}
			if (typeof options.onprogress == 'function') {
				options.onprogress(progress);
			}
		};
		
		var self = this;
		var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
		var chunkSize = self._config.chunkSize;
		var chunksNum = Math.ceil(file.size / chunkSize);
		var maxRetries = options.maaxRetry || 3;
		var completedNum = 0;
		var currentPart = 0;
		var multipartMap = {
			Parts: []
		};
		var params = {
			Bucket: self._config.bucket,
			Key: options.key,
			ContentType: file.type || ''
		};
		_extend(params, options.headers);
		self.oss.createMultipartUpload(params, function(mpErr, res) {
			if (mpErr) {
				if (typeof options.onerror == 'function') {
					options.onerror(err);
				}
				return;
			}
			var uploadId = res.UploadId;
			uploadChunck(uploadId);
		});

		var uploadChunck = function(id) {
			var frOnload = function(e) {
				var partParams = {
					Body: e.target.result,
					Bucket: self._config.bucket,
					Key: options.key,
					PartNumber: String(currentPart + 1),
					UploadId: id
				};
				var tryNum = 0;
				var doUpload = function() {
					self.oss.uploadPart(partParams, function(multiErr, mData) {
						if (multiErr) {
							if (tryNum > maxRetries) {
								console.log('上传分片失败: #', partParams.PartNumber);
								callback(multiErr);
							} else {
								console.log('重新上传分片: #', partParams.PartNumber);
								tryNum++;
								doUpload();
							}
							return;
						}
						multipartMap.Parts[currentPart] = {
							ETag: mData.ETag,
							PartNumber: currentPart + 1
						};
						currentPart++;
						callback(null, null, currentPart/chunksNum);
						if (currentPart == chunksNum) {
							var doneParams = {
								Bucket: self._config.bucket,
								Key: options.key,
								CompleteMultipartUpload: multipartMap,
								UploadId: id
							}
							self.oss.completeMultipartUpload(doneParams, callback);
						} else {
							uploadChunck(id);
						}
					});
				};
				doUpload();
			};
			var frOnerror = function() {
				console.error("读取文件失败");
				callback("读取文件失败");
			}
			var reader = new FileReader();
			reader.onload = frOnload;
			reader.onerror = frOnerror;
			var start = currentPart * chunkSize;
			var end = start + chunkSize;
			if (end > file.size) {
				end = file.size;
			}
			reader.readAsArrayBuffer(blobSlice.call(file, start, end));
		};
	};
	window.OssUpload = OssUpload;
})();
