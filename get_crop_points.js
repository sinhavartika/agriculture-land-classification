var request = require('request');
var $q = require('q');
var fs = require('fs');

var villages = [];
var grndPoints = [];

var GET_CROP_POINT_REQ_LIMIT = 5;

var MongoClient = require('mongodb').MongoClient;
var configuration = {
    uri : 'mongodb://earth2orbit:ZGSYvudvreIJdpCroJF2Q61QZDs0E2kXrBq9uJyxO2pa0PE8RInt4b8kDrnUkTwpdCxM4Fxcu3Gadv1MvfI6Qg==@earth2orbit.documents.azure.com:10250/?ssl=true',
    user : "root",
    pass : 'admin'
}
var dbConnection = undefined;
var admintrative_division_collection = [];  
var crop_point_collection = [];
var villagesId = []; 
var villages = [];
var rejected = [];
var point_count = 0;
try{
    // Seeting up database connection
    _getDB(configuration)
    .then(function(response){
        dbConnection = response;
		dbConnection.collection('adminstrative_divisions',function(err, collection){
			if(!err){
				admintrative_division_collection = collection;
				// get adminstrative collection referennce from mongo
				dbConnection.createCollection('crop_points', function(err, crop_collection) {
					if(!err){
						crop_point_collection = crop_collection;
						_getAllVillagesFromDb(collection)
						.then(function(vresponse){
							console.log("Count of villages in AP");
							console.log(vresponse.length);
						})
						.catch(errorCallback);		                    
					}else{
						console.log("ERROR : CREATING CROP POINTS " + err);
					}
				}); 
			}else{
				console.log("Error while getting connection" + err);
			}
		});
    })
    .catch(errorCallback)
}catch(error){
    console.log(error);
}

function _getAllVillagesFromDb(collection){
	var deferred = $q.defer();
	collection.find({'admin_type' : 'mandal'},{timeout:false}).toArray(function(err, items) {
		if(!err){
			for(var mandalitr = 281; mandalitr < 400; mandalitr++){
				villagesId = villagesId.concat(items[mandalitr].villages);
			}
			fs.appendFileSync('villagesid.json', villagesId);
			function getAllVillagesCallback(villagesResponse){
				deferred.resolve(villagesResponse);
			}
			_callInSeries(villagesId, _getVillage, getAllVillagesCallback, 0, GET_CROP_POINT_REQ_LIMIT);
		}else{
			deferred.reject(err);
		}
	});
    return deferred.promise;
}

function _getVillage(villageId){
	var deferred = $q.defer();
	admintrative_division_collection.findOne({'id' : villageId},function(err,docs){
		if(!err){
			_getAllPoints(docs)
			.then(function(points){
				points = JSON.parse(points);
				point_count += points.length;
				points = points.map(function(point){
					delete point.farmer_name;
					point.villageId = docs.id;
					point.districtId = docs.districtId; 
					point.mandalId = docs.mandalId;
					return point;
				});
				if(!points.length){
					deferred.resolve(docs); 
					console.log("village with no points " + villageId); 
					fs.appendFileSync('rejected_villages.json', villageId + ",");
					return; 
				}
				crop_point_collection.insert(points, {w:1}, function(err, result) {
					if(!err){
						console.log("Successfully inserted  all points for village " + villageId);
						fs.appendFileSync('accepted_villages.json', villageId + ",");						
						deferred.resolve(docs);
					}else{
						console.log("ERROR : INSERT PONTS " + err);
						deferred.reject(err);
					}
				});			
				deferred.resolve(docs);
			}).catch(function(err){console.log(err)});
		}else{
			console.log(err);
			deferred.reject(err);
		}
	});
	return deferred.promise;
}
/** 
  * Function to get all villages for a mandal
  * @params 
  *         districtId : districtId
  *         mandalId : mandalId
  *         villageId : villageId
  */ 
function _getAllPoints(village){
    console.log("Making call for points in district " + village.districtId + " mandal " + village.mandalId + " village " + village.id)
    return _requestData({
        url: 'http://45.114.143.92/CMRabiWebService/includes/areaSownDataObjects.php',
        method: 'GET',
        qs: {
            'page' : 'GMapRepTest', 
            "selectedDist" : village.districtId, 
            "selectedMand" : village.mandalId, 
            "selectedVill" : village.id
        }
    });
}
/**
  * Generic error callback
  */
function errorCallback(response) {
    console.log(response)
}
/** 
  * Function to get all villages for a mandal
  * @params 
  *         districtId : districtId
  *         mandalId : mandalId
  *         villageId : villageId
  */ 
function _getAllPoints(village){
    console.log("Making call for points in district " + village.districtId + " mandal " + village.mandalId + " village " + village.id)
    return _requestData({
        url: 'http://45.114.143.92/CMRabiWebService/includes/areaSownDataObjects.php',
        method: 'GET',
        qs: {
            'page' : 'GMapRepTest', 
            "selectedDist" : village.districtId, 
            "selectedMand" : village.mandalId, 
            "selectedVill" : village.id
        }
    });
}


function _requestData(options){
    var deferred = $q.defer();
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            deferred.resolve(body);
        }else{
            _outputData(response, "error.json")
            deferred.reject(error);
        }
    });
    return deferred.promise;
}

/** 
  * function to output data in a file
  */
function _outputData(data, filePath){
    var dataStr = JSON.stringify(data, null, 4);
    fs.writeFile(filePath, dataStr, function(err) {
        if(err) {
            console.log(err);
        }else{
            console.log('Successfully written in ' + filePath);
        }
    });
}

function _getDB(configuration){
    var deferred = $q.defer();
    MongoClient.connect(configuration.uri, function(err, db) {
        if(!err) {
            deferred.resolve(db);
        }else{
            console.log(err);
            deferred.reject(err);
        }
    }); 
    return deferred.promise;
}

function _callInSeries(array, fn, callback, mark, limit, responseCollection){
    responseCollection = responseCollection || [];
    var subset = array.slice(mark, mark + limit);
    if(mark >= array.length){
        callback(responseCollection);
		console.log("series done")
        return;
    }
    var promises = subset.map(function(obj){
        return fn(obj);
    });
    $q.all(promises).then(series).catch(function(err){console.log(err)});
    function series(response){
        console.log("*************Initiating Call********************");
        responseCollection = responseCollection.concat(response);
		console.log("Number of points collected " + point_count);
		var setTimeoutTime = 5000;
		if(point_count > 5000){
			point_count = 0;
			setTimeoutTime = 60000;
			console.log("Time to sleep...............................................");
		}
		setTimeout(function () {
		  _callInSeries(array, fn, callback, mark + limit, limit, responseCollection);
		}, setTimeoutTime)
    }
}