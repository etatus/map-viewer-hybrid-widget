(function () {

	//TODO: revisar el bridge. A lo mejor en el id de _allowedEventsData deberia poner el tipo de dato que es para realizar la conversion.
	//TODO: ¡OJO! el getFeatureInfo no esta funcionando cuando se hace tras la prueba 10 (con dos capas)

    "use strict";
    
    var Map = window.API.SW.Map;
	var MapRegion = {};
	var Data = {
		Layers: {},
		BaseLayer: null
	};
	
	var _routeShowed = null;
	var _annotationClicked = null;
	
	
	
	var _self = {};
	_self.map = null;//TODO: load the map and get its id
	
	
	/**
	 * Processes a map lonclick event and make the getFeatureInfo of all the added queryable layers at the point.
	 */
	_self.getFeatureInfo = function getFeatureInfo(e){
			
		var region = MapRegion;
		
		var halfMapSizeX = region.longitudeDelta / 2;
		var halfMapSizeY = region.latitudeDelta / 2;
		
		//Calculate the pixel position based on the coordinates (in a supposed 1000x1000 view)
		var distanceToTopLeftCornerX = Math.abs((region.longitude + halfMapSizeX) - e.longitude);
		var distanceToTopLeftCornerY = Math.abs((region.latitude - halfMapSizeY) - e.latitude);
		var pixelX = Math.round((distanceToTopLeftCornerX / region.longitudeDelta) * 1000);
		var pixelY = Math.round((distanceToTopLeftCornerY / region.latitudeDelta) * 1000);
			
		var nLayers = 1; //Start with 1 because of the base layer
		for(var layerId in Data.Layers)
			nLayers++;
		var nLayersReady = 0;
		var eventInfo = {
			coordinates: {
				longitude: e.longitude,
				latitude: e.latitude
			},
			features: []
		};
		
		var checkIsFinished = function(){
			if(++nLayersReady == nLayers){
				MashupPlatform.wiring.pushEvent("featureInfoOutput", JSON.stringify(eventInfo));
		    }
		};
		
		var layers = {};
		for(var layerId in Data.Layers){
			layers[layerId] = Data.Layers[layerId].layerInfo;
		}
		layers['*_BASELAYER_*'] = Data.BaseLayer;

		for(var layerId in layers){

			var layer = layers[layerId];
			
			if(layer != null && layer.queryable == true && layer.service === 'WMS'){
				
				//Prepare the getCapabilities request parameters
				if(layer.projection == "EPSG:4230" || layer.projection == "EPSG:4326" || layer.projection == "EPSG:4258") //miny, minx, maxy, maxx
					var bbox = [region.latitude - halfMapSizeY, region.longitude - halfMapSizeX, region.latitude + halfMapSizeY, region.longitude + halfMapSizeX];
				else //minx, miny, maxx, maxy
					var bbox = [region.longitude - halfMapSizeX, region.latitude - halfMapSizeY, region.longitude + halfMapSizeX, region.latitude + halfMapSizeY];
					
					
				var requestParams = {
					request: 'GetFeatureInfo',
					service: 'WMS',
					version: layer.version,
					layers: layer.name,
					query_layers: layer.name,
					styles: '',
					format: 'text/plain',
					bbox: bbox.join(','),
					width: '1000',
					height: '1000'
				};
				
				requestParams[(layer.version == '1.3.0' ? 'crs' : 'srs')] = layer.projection;
				requestParams[(layer.version == '1.3.0' ? 'i' : 'x')] = pixelX;
				requestParams[(layer.version == '1.3.0' ? 'j' : 'y')] = pixelY;

				var params = [];
				for(var param in requestParams){
					params.push(param + '=' + requestParams[param]);
				}
				
				params = params.join('&');
				var requestUrl = layer.url + '?' + params;
				console.log(requestUrl);
				
				MashupPlatform.http.makeRequest(requestUrl, {
					method: 'GET',
					onSuccess: function(layer, response){
							
							eventInfo.features.push({
								text: response.responseText,
								service: layer.url,
								layer: layer.name
							});
								
						    checkIsFinished();
				        	
					}.bind(null, layer),
					onException: checkIsFinished,
					contentType: 'text/plain'
				});
				
				
				
			} else {
				nLayersReady++;
			}
					
		}		
		
	};
	
	
	/**
	 * Event click on Annotation
	 */
	_self.funClickAnnotation = function funClickAnnotation(e){
		if(e.clicksource == 'pin'){
			
			var _anno = e.source;
			
			_anno.getProperties(['id', 'title', 'subtitle', 'image', 'latitude', 'longitude'], function(_propResults){
				
				var eventData = JSON.stringify({
					id: _propResults.id,
					title: _propResults.title,
					subtitle: _propResults.subtitle,
					icon: _propResults.image,
					tooltip: null,
					coordinates: {
						latitude: _propResults.latitude,
						longitude: _propResults.longitude
					}
				});
				
				MashupPlatform.wiring.pushEvent("poiSelectedOutput", eventData);
				
			});

		}
	};
	
	/**
	 * Event change viewport of Map
	 */ 
	_self.funChangeMap = function funChangeMap(e){
		if(_annotationClicked != null) {
			_self.map.selectAnnotation(_annotationClicked);
			_annotationClicked = null;
		}
		
		// SendBounds
		var _mapRegion = e;
		if(MapRegion == null || _mapRegion.longitude != MapRegion.longitude || _mapRegion.latitude != MapRegion.latitude 
				|| _mapRegion.longitudeDelta != MapRegion.longitudeDelta ||  _mapRegion.latitudeDelta != MapRegion.latitudeDelta){
			
			MapRegion = _mapRegion;
		
			var _mapInfoEventData = {
				bounds: {
					upperLeftCorner: {
						longitude: _mapRegion.longitude - _mapRegion.longitudeDelta/2,
						latitude: _mapRegion.latitude + _mapRegion.latitudeDelta/2,
					},
					lowerRightCorner: {
						longitude: _mapRegion.longitude + _mapRegion.longitudeDelta/2,
						latitude: _mapRegion.latitude - _mapRegion.latitudeDelta/2,
					}
				},
				cursorCoordinates: null,
				focus: null
			};

			MashupPlatform.wiring.pushEvent("mapInfoOutput", JSON.stringify(_mapInfoEventData));
		}
		

		// SendPoiList
		_self.map.getVisibleAnnotationsInRegion(_mapRegion, function(_annoInfoArray){
			
			var _poiListToSend = [];
			
			for (var i in _annoInfoArray) {
				
				var _annoInfo = _annoInfoArray[i];
				
				_poiListToSend.push({
					id : _annoInfo.id,
					title : _annoInfo.title,
					subtitle : _annoInfo.subtitle,
					icon : _annoInfo.image,
					tooltip : null,
					coordinates : {
						latitude : _annoInfo.latitude,
						longitude : _annoInfo.longitude
					}
				});
				
			}
			
			MashupPlatform.wiring.pushEvent("visiblePoiListOutput", JSON.stringify(_poiListToSend));
			
		});
		

	};

	/** @title: handlerInputRoute (Function)
	  * @parameters: routeString (JSON data {from: poiIdOrigin, to: poiIdDestiny})
	  *              mode = [ walking | transit | driving ]
	  * @usage: remove current route if exist
	  * 		represent route between two annotations 
	  *         fireEvent routeDescriptionOutput */
	_self.handlerInputRoute = function handlerInputRoute (routeString, mode){
		
		routeString = JSON.parse(routeString);
		var _pOrigin;
		var _pDestiny;
		
		var _getPoint = function _getPoint(pointData, callback){
			
			if(pointData === "MKUSERLOCATION"){
				Ti.Geolocation.getCurrentPosition(function(e){
					if(e.error) _point = null;
					else {
						_point.latitude = e.latitude;
						_point.longitude = e.longitude;
						
						callback(_point);
					}
				});
			} else {
				var _anno = checkAnnotation(pointData, function(_anno){
					
					if(_anno != null){
						_anno.getProperties(["latitude", "longitude"], function(_point){
							callback(_point);
						});
						
					} else {
						callback(null);
					}
					
				});
				
			}
			
		};
		
		//Get the points of origin and destination and create the route
		_getPoint(routeString.from, function(_pOrigin){
			
			_getPoint(routeString.to, function(_pDestiny){
			
				_createRoute(_pOrigin, _pDestiny);
			
			});
			
		});
		
		
		var _createRoute = function _createRoute(_pOrigin, _pDestiny){
			
			if(_pOrigin != null && _pDestiny != null){
			
				//Remove the previously showed route
				_self.handlerCleanRoute();
				
				var _conA = getRouteWidgetMap(_pOrigin, _pDestiny, mode, function(values) {
					if (values !== "Error" && JSON.parse(values).status === "OK") {
							
						var eventData = JSON.stringify({data:JSON.parse(values).routes});
						MashupPlatform.wiring.pushEvent("routeDescriptionOutput", eventData);
						
						_routeShowed = JSON.parse(values).routes[0];
						var _leg = _routeShowed.legs;
	            		for(var _i in _leg){
	            			var _allPoints = new Array();
	              			for(var step = 0; step < _leg[_i].steps.length; step++){
	              				_allPoints.push(decodePolyline(_leg[_i].steps[step].polyline.points));	
	              			} 
	              			var _pointsRoute = new Array();
	              			for (var _j = 0; _j < _allPoints.length; _j++){
	              				_pointsRoute = _pointsRoute.concat(_allPoints[_j]);
	              			}
	              			_allPoints = null;
	              			
	              			//Create and add the route
	              			Map.createRoute({
	              				points: _pointsRoute,
	              				color: "blue",
	              				width: 4
	              			}, function(_route){
	              				_self.map.addRoute(_route);
	              				_route = null;
	              			});
	              			
	              			_pointsRoute = null;
	              			step = null;
	              			_j = null;
	            		}
	            		_i = null;
	            		_leg = null;
					}
					_conA = null;
				});
					
				_pDestiny = null;
				_pOrigin = null;
			}
			
		};
		
	};
	
	
	/** @title: handlerInputRouteStep (Function)
	  * @parameters: stepNum (number step of routeShowed)
	  * @usage: show alert with information of route */
	_self.handlerInputRouteStep = function handlerInputRouteStep (stepNum){
		if(_routeShowed != null){
			var _step = _routeShowed.legs[0].steps[stepNum];	
			_self.map.setLocation({
				latitude:_step.start_location.lat,
				longitude:_step.start_location.lng,
				animate:true,
    		 	latitudeDelta:0.001953125,
    		 	longitudeDelta:0.001953125
		 	});
		}
	};
	
	
	/** @title: handlerCleanRoute (Function)
	  * @usage: remove Route of the Map */
	_self.handlerCleanRoute = function handlerCleanRoute(){
		if(_routeShowed != null) {
			_self.map.removeRoute(_routeShowed);
			_routeShowed = null;
		}
	};
	
	
	/** @title: handlerInputAddress (Function)
	 *  @parameters: JSON data with the following elements:
	 * 		• id*: String
	 * 		• address*: String.
	 *  @usage: create POI from address for add to Map */
	_self.handlerInputAddress = function handlerInputAddress (data) {
		var _addressData = JSON.parse(data);
		var _addrString = _addressData.address;
		
		//Check that the POI does not exist
		if(_addressData.id == null){
			Ti.API.info("[handlerInputAddress] Annotation already exists.");
			return;
		}
		
		checkAnnotation(_addressData.id, function(_anno){
			
			if(_anno != null){
				Ti.API.info("[handlerInputAddress] Annotation already exists.");
				return;
			}			
			
			var client = new XMLHttpRequest();
			client.onreadystatechange = function() {
				if (client.readyState != 4)  { return; }
				if (client.status == 200){
					var json = JSON.parse(client.responseText);
				
					if(json.status == "OK" && json.results.length > 0){
						var _result = json.results[0];
						Map.createAnnotation({
			    			id: _addressData.id,
			    			title: _addrString,
			        		latitude: _result.geometry.location.lat,
			        		longitude: _result.geometry.location.lng
			    		}, function(_poi){
			    			_poi.addEventListener('click', _self.funClickAnnotation);
			    			_self.map.addAnnotation(_poi);
			    			_poi = null;
			    		});
			    		
					}
					
					data = null;
					json = null;
					_result = null;
		    		_addressData = null;
		    		_addrString = null;
				}
			};
			client.open("GET", 'http://maps.googleapis.com/maps/api/geocode/json?address=' + _addrString);
			client.send();
			
		});
		
		
	};

	var normalizePOI = function(data) {
		var finalPOI;

		if (data.coordinates == null && data.currentLocation !== null) {
			finalPOI = {
				'id': data.id,
				'coordinates' : {
					'longitude': data.currentLocation.lng,
					'latitude': data.currentLocation.lat
				}
			};
			if (data.title) {
				finalPOI.title = data.title;
			}
			if (data.subtitle) {
				finalPOI.subtitle = data.subtitle;
			}
			if (data.icon) {
				finalPOI.icon = data.icon;
			}
			if (data.infoWindow) {
				finalPOI.infoWindow = data.infoWindow;
			}
		} else {
			finalPOI = data;
		}
		console.log("normalizePOI: " + JSON.stringify(finalPOI));
		return finalPOI;
	};

	/** @title: handlerInputPoi (Function)
	  * @parameters: data (JSON data POI) with the following elements:
	  * 	• id*.
	  * 	• title.
	  * 	• subtitle.
	  * 	• icon: Image URL.
	  * 	• tooltip:
	  * 	• coordinates*:
	  * 		◦ longitude.
	  * 		◦ latitude.
	  *		• infoWindow.
	  *  callback: optional. Called when finished.
	  * @usage: add POI to Map */
	_self.handlerInputPoi = function handlerInputPoi(data, callback){
		var i, props2Change, poiList, loopCounter;
		console.log("handlerInputPoi initial data: " + data);
		data = JSON.parse(data);
		if (data.length == null) {
			console.log("Single Data: " + JSON.stringify(data));
			data = [data];
		}
		poiList = [];
		loopCounter = 0;
		for (i = 0; i < data.length; i ++) {
			console.log("adding/updating POI. data: " + JSON.stringify(data[i]));
			var _poiData = normalizePOI(data[i]);
			checkAnnotation(_poiData.id, function(_pA){
				console.log("checkAnnotation POI ID: " + JSON.stringify(_pA));
				//Edit POI (only id is compulsory)
				if(_pA !== null){
					console.log("Updating POI ID: " + _poiData.id);
					props2Change = {};
					if(_poiData.title != null) {
						props2Change["title"] = _poiData.title;
					}
					if(_poiData.subtitle != null) {
						props2Change["subtitle"] = _poiData.subtitle;
					}
					if(_poiData.icon != null) {
						props2Change["image"] = _poiData.icon;
					}
					if(_poiData.coordinates != null && _poiData.coordinates.latitude != null) {
						props2Change["latitude"] = _poiData.coordinates.latitude;
					}
					if(_poiData.coordinates != null && _poiData.coordinates.longitude != null) {
						props2Change["longitude"] = _poiData.coordinates.longitude;
					}
					_pA.setProperties(props2Change);
				//Create POI
				} else {
					console.log("creating POI ID: " + _poiData.id);
					poiList.push(
						{   
							id: _poiData.id,
							title: _poiData.title,
							subtitle: _poiData.subtitle,
							latitude: _poiData.coordinates.latitude,
							longitude: _poiData.coordinates.longitude,
							image: _poiData.icon,
							html: _poiData.infoWindow,
							htmlWidth: 100
						}
					);
					console.log("Add POI " + _poiData.id + " to poiList");
				}
				if (++loopCounter == data.length) {
					// Last loop
					if (poiList.length > 0) {
						Map.createAnnotation(poiList, function(_pAList){
							console.log("POI LIST CREATED 1 -->" + JSON.stringify(_pAList));
							var i;
							for (i = 0; i < _pAList.length; i ++) {
								_pA = _pAList[i];
								_pA.addEventListener('click', _self.funClickAnnotation);
								_self.map.addAnnotation(_pA);
								_pA = null;

							}
							if(typeof(callback) == "function") {
								callback();
							}
							console.log("POI LIST CREATED 2 -->" + JSON.stringify(_pAList));
						});
						
					}
				} else {
					if(typeof(callback) == "function") {
						callback();
					}
				}
				_pA = null;
			});
		}
	};

	/** @title: handlerInputDeletePoi (Function)
	  * @parameters: data (JSON data POI). Contains the following elements:
	  * 	• id*.
	  * @usage: delete POI in Map */
	_self.handlerInputDeletePoi = function handlerInputDeletePoi(data){
		var _poiData = JSON.parse(data);
		
		checkAnnotation(_poiData.id, function(_pA){
			if(_pA !== null){
				_pA.removeEventListener('click', _self.funClickAnnotation);
				_self.map.removeAnnotation(_pA);
			}
				
			_poiData = null;
			_pA = null;
		}); 
		
	};
	
	/** @title: handlerInputPoiCenter (Function)
	  * @parameters: data (JSON data POI)
	  * @usage: usage POI for center Map */
	_self.handlerInputPoiCenter = function handlerInputPoiCenter(data){
		_self.handlerInputPoi(data, function(){
			_self.handlerInputSelectPoi(data);
		});
		
	};
	
	/** @title: handlerInputSelectPoi (Function)
	  * @parameters: poiString (JSON data POI)
	  * @usage: center Map with poi */
	_self.handlerInputSelectPoi = function handlerInputSelectPoi(poiString){
		var _poi = JSON.parse(poiString);
		
		checkAnnotation(_poi.id, function(_pA){
			if(_pA !== null) {
				_annotationClicked = _pA;
				_self.map.selectAnnotation(_pA);
				
				_pA.getProperties(["latitude", "longitude"], function(_point){
						
						_self.map.setLocation({
							latitude: _point.latitude,
							longitude: _point.longitude,
							zoom: parseInt(MashupPlatform.prefs.get("zoomPreference")) - 1,
							animate: true
						});
						
						_point = null;
					
				});
				
				_pA = null;
	    	}
			
		});
		
		_poi = null;
		
	};
	
	/**
	 * Allows to synchronize the view of different maps.
	 * @params Object with the following elements:
	 * 	• bounds*.
	 * 		◦ upperLeftCorner:
	 * 			▪ Longitude.
	 * 			▪ Latitude.
	 * 		◦ lowerRightCorner:
	 * 			▪ Longitude.
	 * 			▪ Latitude.
	 * 	• cursorCoordinates*: not used in this case (there is no mouse)
	 * 		◦ Longitude.
	 * 		◦ Latitude.
	 * 	• focus*: True or False. Not used in this case (there is no mouse)	
	 */
	_self.handlerMapInfoInput = function handlerMapInfoInput (data) {
		var mapInfoData = JSON.parse(data);
		
		var latitude = (parseFloat(mapInfoData.bounds.upperLeftCorner.latitude) + parseFloat(mapInfoData.bounds.lowerRightCorner.latitude)) / 2;
		var longitude = (parseFloat(mapInfoData.bounds.upperLeftCorner.longitude) + parseFloat(mapInfoData.bounds.lowerRightCorner.longitude)) / 2;
		var changeLocationData = {
			latitude: latitude, 
			longitude: longitude, 
			latitudeDelta: Math.abs(parseFloat(mapInfoData.bounds.upperLeftCorner.latitude) - parseFloat(mapInfoData.bounds.lowerRightCorner.latitude)), 
			longitudeDelta: Math.abs(parseFloat(mapInfoData.bounds.upperLeftCorner.longitude) - parseFloat(mapInfoData.bounds.lowerRightCorner.longitude)), 
			animate: false
		};
		
		_self.map.setLocation(changeLocationData);		
		
	};
	
	
	/**
	 * Add a service. In this case, open a windows to add a layer with the service selected.
	 * @params JSON data with the following elements:
	 * 		• action*. String. The action to be accomplished: 'addLayer' | 'setBaseLayer' | 'removeLayer'
	 * 		• data*. Object. Depending on the action, it can contain different values.
	 * 
	 * 			ADDLAYER
	 * 			• id. An id to identify the layer.
	 * 			• service. String. Currently, only 'WMS' is supported.
	 * 			• version. String. Currently, only '1.1.1' and '1.3.0' are supported.
	 * 			• url. Url of the map service.
	 * 			• name: String. Name of the layer.
	 * 			• projection. String.
	 * 			• zIndex. Integer,
	 * 			• opacity. Integer. [0, 100]
	 * 			• queryable. Boolean. If the layer has support for the getFeatureInfo request.
	 * 
	 * 			SETBASELAYER
	 * 			Two behaviors depending on whether id is given (a predefined layer) or not (a new layer).
	 * 				Predefined layer:
	 * 					• id. String. Constant representing the predefined layer: 'GOOGLE_STANDARD' | 'GOOGLE_SATELLITE' | 'GOOGLE_HYBRID'
	 * 				New layer:
	 * 					• service. String. Currently, only 'WMS' is supported.
	 * 					• version. String. Currently, only '1.1.1' and '1.3.0' are supported.
	 * 					• url. Url of the map service.
	 * 					• name: String. Name of the layer.
	 * 					• projection. String.
	 * 					• queryable. Boolean. If the layer has support for the getFeatureInfo request. 
	 * 
	 * 			REMOVELAYER
	 * 			• id. An id to identify the layer to be removed (set in the addLayer action). Base layers can not be removed with this method.
	 * 			
	 */
	_self.handlerLayerInfoInput = function  handlerLayerInfoInput (data) {
		var _layerInfo = JSON.parse(data);
		
		switch(_layerInfo.action){
			case 'addLayer':
				handleAddLayer(_layerInfo.data);
				break;
			case 'setBaseLayer':
				handleSetBaseLayer(_layerInfo.data);
				break;
			case 'removeLayer':
				handleRemoveLayer(_layerInfo.data);
				break;
			default:
				console.log("Invalid action for LayerInfoInput");
		}
		
	};
	 
	 
	/*
	 * HELPER METHODS 
	 */
	
	/** @title: decodePolyline (Function)
	  * @parameters: pl (Encoded String Route) 
	  * @usage: return Array of Coordinates 
	  */
	var decodePolyline = function decodePolyline(pl){
			var encoded = pl;
    		var index = 0;
    		var array = new Array();
    		var lat = 0;
    		var lng = 0;
    		while (index < encoded.length) {
        		var b;
        		var shift = 0;
        		var result = 0;
        		do {
            		b = encoded.charCodeAt(index++) - 63;
            		result |= (b & 0x1f) << shift;
            		shift += 5;
        		} while (b >= 0x20);
        		lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
        		shift = 0;
        		result = 0;
        		do {
            		b = encoded.charCodeAt(index++) - 63;
            		result |= (b & 0x1f) << shift;
            		shift += 5;
        		} while (b >= 0x20);
        		lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
        		array.push({latitude:lat * 0.00001,longitude:lng * 0.00001});
    		}
    		return array;
		};		
	
	/** @title: getRouteWidgetMap (Function)
	 *  @param: pointOrigin, pointDestiny, mode, callback_function
	 *  @usage: create HTTP client for Create Route */
	var getRouteWidgetMap = function getRouteWidgetMap(pointOrigin, pointDestiny, mode, callback_function) {
		var url = "http://maps.googleapis.com/maps/api/directions/json?origin=" + pointOrigin.latitude + "," + pointOrigin.longitude + 
					"&destination=" + pointDestiny.latitude + "," + pointDestiny.longitude + 
					"&sensor=false&optimize=true&mode=" + mode/* + 
					"&language=" + Ti.Locale.currentLanguage*/;
					
		var client = new XMLHttpRequest();
		client.onreadystatechange = function(){
			if (client.readyState != 4)  { return; }
			if (client.status == 200)
		    	callback_function(client.responseText);
		   	else
		   		callback_function("Error");
		};
		client.open("GET", url);
		client.send();
	};

	
	/** @title: checkAnnotation (Function)
	  * @parameters: id of poiToCheck
	  * @usage: return Annotation into the map or null if not exist */
	var checkAnnotation = function checkAnnotation(annotationId, callback){
		_self.map.getProperties(["annotations"], function(result){
			console.log(JSON.stringify(result));
			if(!result){
				callback(null);
			}

			var found = false;
			for(var i in result.annotations){
				if(result.annotations[i].id === annotationId){
					callback(result.annotations[i]);
					found = true;
					break;
				}
			}

			result = null;

			if(!found)
				callback(null);
		});
	};

	/**
	 * Handles the addLayer action.
 	 * @param {Object} _layerData The data property of the info given as input of the widget for the addLayer action.
	 */
	var handleAddLayer = function handleAddLayer(_layerData){
		
		if(_layerData != null && _layerData.id != null && Data.Layers[_layerData.id] == null){
			
			var _layerType = getLayerType(_layerData.service, _layerData.version);
			
			if(_layerType != null){
				
				var layer = Map.createLayer({
					baseUrl: _layerData.url,
					type: _layerType,
					name: _layerData.name,
					srs: _layerData.projection,
					zIndex: _layerData.zIndex,
					visible: true,
					opacity: _layerData.opacity,
					format: Map.FORMAT_PNG
				}, function(layer){
					
					Data.Layers[_layerData.id] = {
						layerInfo: _layerData,
						layer: layer
					};
					_self.map.addLayer(layer);
					
				});
				
				
			} else {
				console.log("The type of service of the layer is not supported.");
			}
			
		}
		
	};
	
	
	
	/**
	 * Handles the setBaseLayer action.
 	 * @param {Object} _layerData The data property of the info given as input of the widget for the setBaseLayer action.
	 */
	var handleSetBaseLayer = function handleSetBaseLayer(_layerData){
		
		// Is a Google layer
		if(_layerData != null && _layerData.id != null) {
			
			var _layerType = null;
			switch(_layerData.id){
				case 'GOOGLE_STANDARD':
					_layerType = Map.STANDARD_TYPE;
					break;
				case 'GOOGLE_SATELLITE':
					_layerType = Map.SATELLITE_TYPE;
					break;
				case 'GOOGLE_HYBRID':
					_layerType = Map.HYBRID_TYPE;
					break;
				default:
					console.log("Invalid base layer.");
					return; //Stop execution
			}
			
			_self.map.setBaseLayer(_layerType);
			Data.BaseLayer = _layerType;
			
		} else if(_layerData != null) { //Is a non predefined layer
			
			var _layerType = getLayerType(_layerData.service, _layerData.version);
			
			if(_layerType != null){
				
				var layer = Map.createLayer({
					baseUrl: _layerData.url,
					type: _layerType,
					name: _layerData.name,
					srs: _layerData.projection,
					visible: true,
					format: Map.FORMAT_JPEG
				}, function(layer){
					
					_self.map.setBaseLayer(layer);
					Data.BaseLayer = _layerData;
					
				});
				
				
			} else {
				console.log("The type of service of the layer is not supported.");
			}
			
			
		}
		
		
	};
	
	/**
	 * Handles the removeLayer action.
 	 * @param {Object} _layerData The data property of the info given as input of the widget for the removeLayer action.
	 */
	var handleRemoveLayer = function handleRemoveLayer(_layerData){
		
		if(_layerData != null && _layerData.id != null && Data.Layers[_layerData.id] != null) {
			
			_self.map.removeLayer(Data.Layers[_layerData.id].layer);
			
			delete Data.Layers[_layerData.id].layer;
			delete Data.Layers[_layerData.id].layerInfo;
			delete Data.Layers[_layerData.id];
			
		}
		
	};
	
	
	/**
	 * Get the type of service of the layer.
	 * @param {String} _service Type of service (WMS, ...).
	 * @param {String} _version Version of the service.
	 * @return {Integer} The constant to be used with the map to represent that type of service.
	 */
	var getLayerType = function getLayerType(_service, _version){
		
		if(_service === 'WMS'){
				
			var _layerType = null;
			switch(_version){
				case '1.1.1':
					_layerType = Map.LAYER_TYPE_WMS_1_1_1;
					break;
				case '1.3.0':
					_layerType = Map.LAYER_TYPE_WMS_1_3_0;
					break;
				default:
					break;
			}
			
			return _layerType;
		}
		
	};

	var createMap = function createMap(creationArgs){
		
		Map.createMap(creationArgs, function(_map){
			
			var mapCanvas = document.getElementById('map_canvas');

			_self.map = _map;
			
			//Display the map
			console.log(mapCanvas.getBoundingClientRect());
			_self.map.addBound({
				height: '100%',
				width: '100%',
				top:0,
				left: 0
			});
			
			_self.map.addEventListener('regionchanged', _self.funChangeMap);
			_self.map.addEventListener('longclick', _self.getFeatureInfo);
			
			//Now, register all the widget inputs
			MashupPlatform.wiring.registerCallback('routeInput', _self.handlerInputRoute);
			MashupPlatform.wiring.registerCallback('routeStepInput', _self.handlerInputRouteStep);
			MashupPlatform.wiring.registerCallback('addressInput', _self.handlerInputAddress);
			MashupPlatform.wiring.registerCallback('poiInput', _self.handlerInputPoi);
			MashupPlatform.wiring.registerCallback('deletePoiInput', _self.handlerInputDeletePoi);
			MashupPlatform.wiring.registerCallback('poiInputCenter', _self.handlerInputPoiCenter);
			MashupPlatform.wiring.registerCallback('selectPoiInput', _self.handlerInputSelectPoi);
			MashupPlatform.wiring.registerCallback('mapInfoInput', _self.handlerMapInfoInput);
			MashupPlatform.wiring.registerCallback('layerInfoInput', _self.handlerLayerInfoInput);

			// Call stacked input callbacks
			var i, inputCall;
			var inputCallbacksHash = {
				'routeInput': _self.handlerInputRoute,
				'routeStepInput': _self.handlerInputRouteStep,
				'addressInput': _self.handlerInputAddress,
				'poiInput': _self.handlerInputPoi,
				'deletePoiInput': _self.handlerInputDeletePoi,
				'poiInputCenter': _self.handlerInputPoiCenter,
				'selectPoiInput': _self.handlerInputSelectPoi,
				'mapInfoInput': _self.handlerMapInfoInput,
				'layerInfoInput': _self.handlerLayerInfoInput
			};

			console.log(' ++ actionsInitialStack ++' + JSON.stringify(actionsInitialStack));
			for (inputCall in actionsInitialStack) {
				if(inputCall == 'poiInput') {
					inputCallbacksHash[inputCall](actionsInitialStack[inputCall]);
				} else {
					for (i = 0; i < actionsInitialStack[inputCall]; i ++) {
						inputCallbacksHash[inputCall](actionsInitialStack[inputCall][i]);
					}
				}
			}
		});
		
	};
	
	var initializeMap = function initializeMap(){
		
		var creationArgs = {
			userLocation: true,
	        animate: true,
	        region: { //latitude and longitude will be added later
	        	zoom: parseInt(MashupPlatform.prefs.get("initialZoom")) - 1 //Zooms in google maps start from 0
	    	}, 
	        enableZoomControls: true,
	        userLocationButton: true
		};
		
		//Get the center. It can be coordinates or an address (which must be resolved with google)
		var centerPreference = MashupPlatform.prefs.get("centerPreference").trim();
		var splited = centerPreference.split(',');
		var latitude = NaN;
		var longitude = NaN;
		
		if (splited.length === 2){
			latitude = parseFloat(splited[0]);
			longitude = parseFloat(splited[1]);
		}
		
		if(isNaN(latitude) || isNaN(longitude)) { //Get address with google service
			
			var url = "http://maps.googleapis.com/maps/api/geocode/json?address=" + centerPreference;
			
			MashupPlatform.http.makeRequest(url, {
				method: 'GET',
				onSuccess: function(response) {

					var parsedResponse = JSON.parse(response.responseText);

					if(parsedResponse.status == "OK") {
						var location = parsedResponse.results[0].geometry.location;
						
						creationArgs.region.latitude = parseFloat(location.lat);
						creationArgs.region.longitude = parseFloat(location.lng);

					} else {
						creationArgs.region.latitude = 0;
						creationArgs.region.longitude = 0;
					}
					
					createMap(creationArgs);
					
				},
				onFailure: function() {
					creationArgs.region.latitude = 0;
					creationArgs.region.longitude = 0;
			
					createMap(creationArgs);
				}
			});
			
		} else { //Set the coordinates
			creationArgs.region.latitude = latitude;
			creationArgs.region.longitude = longitude;
			
			createMap(creationArgs);
		}
		
	};
	

	var actionsInitialStack = {};
	var stackHandler = function(type, data) {
		if (!actionsInitialStack[type]) {
			actionsInitialStack[type] = [];
		}
		actionsInitialStack[type].push(data);
	};

	MashupPlatform.wiring.registerCallback('routeInput', stackHandler.bind(null, 'routeInput'));
	MashupPlatform.wiring.registerCallback('routeStepInput', stackHandler.bind(null, 'routeStepInput'));
	MashupPlatform.wiring.registerCallback('addressInput', stackHandler.bind(null, 'addressInput'));
	MashupPlatform.wiring.registerCallback('poiInput', stackHandler.bind(null, 'poiInput'));
	MashupPlatform.wiring.registerCallback('deletePoiInput', stackHandler.bind(null, 'deletePoiInput'));
	MashupPlatform.wiring.registerCallback('poiInputCenter', stackHandler.bind(null, 'poiInputCenter'));
	MashupPlatform.wiring.registerCallback('selectPoiInput', stackHandler.bind(null, 'selectPoiInput'));
	MashupPlatform.wiring.registerCallback('mapInfoInput', stackHandler.bind(null, 'mapInfoInput'));
	MashupPlatform.wiring.registerCallback('layerInfoInput', stackHandler.bind(null, 'layerInfoInput'));
	
	_self.clearObject = function clearObject(){
		
		_self.map.removeEventListener('regionChanged', _self.funChangeMap);
		_self.map.removeEventListener('longclick', _self.funChangeMap);

		delete _self['getFeatureInfo'];
		delete _self['funChangeMap'];
		delete _self['funClickAnnotation'];
		delete _self['handlerChangeTypeMap'];
		delete _self['handlerInputRoute'];
		delete _self['handlerInputRouteStep'];
		delete _self['handlerCleanRoute'];
		delete _self['handlerInputAddress'];
		delete _self['handlerInputPoi'];
		delete _self['handlerInputDeletePoi'];
		delete _self['handlerInputPoiCenter'];
		delete _self['handlerInputSelectPoi'];
		delete _self['handlerMapInfoInput'];
		delete _self['handlerLayerInfoInput'];

		decodePolyline = null;
		getRouteWidgetMap = null;
		checkAnnotation = null;
		createMap = null;
		initializeMap = null;
		handleAddLayer = null;
		handleRemoveLayer = null;
		handleSetBaseLayer = null;
		
	};
	
	
	Map.isMapAvailable(function(_available){
		if(_available){
			initializeMap();
		} else {
			console.log("Map service is not available.");
		}
	});

	
    
}());


