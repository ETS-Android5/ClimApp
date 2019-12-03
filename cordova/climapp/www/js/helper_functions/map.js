function initMap() {
    // Coordinates for Copenhagen, Denmark
    // Would like to set these dynamically, but cannot reference kb outside DOM?
	
	//bk we could make kb global by putting it in window -> window.kb = ...
    var currentCoordinates = { lat: 55.676098, lng: 12.568337 };

    // Each marker is labeled with a single alphabetical character.
    var labels = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';
    var labelIndex = 0;

    let options = { timeout: 30000 };
	
	/*
	
	there is no need to do this here. put the marker only when the map is shown in DOM, otherwise iOS only shows grey screen.
	
    navigator.geolocation.getCurrentPosition(
        function (position) { //on success
            currentCoordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
        },
        function (error) { //on error
            console.log(error);
        },
        options // here the timeout is introduced
    );
	*/
	//window.map so map is available global scope
    window.map = new google.maps.Map(document.getElementById('map'), { 
        mapTypeId: google.maps.MapTypeId.ROADMAP,
      	center: new google.maps.LatLng(55.676098, 12.568337),
        zoom: 8
    });

    // This event listener calls addMarker() when the map is clicked.
    google.maps.event.addListener(map, 'click', function (event) {
        addMarker(event.latLng, map);
    });

    // Add a marker at the center of the map.
    //addMarker(currentCoordinates, map);

    // Adds a marker to the map.
    function addMarker(location, map) {
        // Add the marker at the clicked location, and add the next-available label
        // from the array of alphabetical characters.
        var marker = new google.maps.Marker({
            position: location,
            label: labels[labelIndex++ % labels.length],
            map: map
        });

        // Setting the location based on location object type (apparently there are two)
        if(typeof location.lat === 'number'){ 
            document.getElementById("latlon").innerHTML ="(" + location.lat + ", " + location.lng + ")";
        } else if(typeof location.lat === 'function'){
            document.getElementById("latlon").innerHTML = location;
        } else {

        }
    }


    /* request for geocoder is denied (will require billing)
    var geocoder = new google.maps.Geocoder();

    document.getElementById('submit').addEventListener('click', function() {
      geocodeAddress(geocoder, map);
    });

    function geocodeAddress(geocoder, resultsMap) {
        var address = document.getElementById('address').value;
        geocoder.geocode({'address': address}, function(results, status) {
          if (status === 'OK') {
            resultsMap.setCenter(results[0].geometry.location);
            var marker = new google.maps.Marker({
              map: resultsMap,
              position: results[0].geometry.location
            });
          } else {
            alert('Geocode was not successful for the following reason: ' + status);
          }
        });
    }*/

    //google.maps.event.addDomListener(window, 'load', initMap);
}