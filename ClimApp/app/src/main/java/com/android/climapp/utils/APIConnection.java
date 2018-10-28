package com.android.climapp.utils;

import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.util.Log;
import android.widget.ImageView;
import android.widget.TextView;

import com.android.climapp.R;
import com.android.climapp.wbgt.Solar;
import com.android.climapp.wbgt.SolarRad;
import com.android.climapp.wbgt.WBGT;
import com.squareup.picasso.Picasso;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;

public class APIConnection extends AsyncTask<String, String, String> {
    /* Key authorizing connection to API */
    private String mAPIKey;

    /* Base url to weather API */
    //private String mtestURL = "http://samples.openweathermap.org/data/2.5/weather?lat=%s&lon=%s&appid=%s";
    private String mBaseURL = "http://api.openweathermap.org/data/2.5/weather?lat=%s&lon=%s&appid=%s";

    /* Calculated string based on input in constructor */
    private String mConnectionString;
    private String pageText;
    private String CHANNEL_ID = "ClimApp";

    // JSON tags
    private static final String TAG_CITY = "name";
    private static final String TAG_MAIN = "main";
    private static final String TAG_WIND = "wind";
    private static final String TAG_WEATHER = "weather";
    private static final String TAG_CLOUDS = "clouds";
    // JSON elements
    private static final String TEMPERATURE = "temp";
    private static final String HUMIDITY = "humidity";
    private static final String TAG_ALL = "all";
    private static final String PRESSURE = "pressure";
    private static final String SPEED = "speed";
    private static final String WEATHER_DESCRIPTION = "description";
    private static final String WEATHER_ID = "id";
    private static final String WEATHER_ICON = "icon";

    private Integer pressure, temperature, cloudiness, weather_id;
    private String city_name, description, icon, temperature_unit;
    private double wind_speed, humidity, mLongitude, mLatitude, mWBGT;
    private com.android.climapp.dashboard.DashboardFragment mDashboard;

    private SharedPreferences mPreferences;
    private com.android.climapp.wbgt.WBGT wbgt;
    private com.android.climapp.wbgt.RecommendedAlertLimitISO7243 ral;

    /* Only working for creating the needed connection string to
    *  openweathermap.org, others will be implemented later on.
    *  Example with input parameters:
    *  http://openweathermap.org/data/2.5/weather?lat=35&lon=139&appid=b1b15e88fa797225412429c1c50c122a1
    */
    public APIConnection(String apiKey, double lat, double lon, SharedPreferences preferences,
                         com.android.climapp.dashboard.DashboardFragment dashboard) {
        mAPIKey = apiKey;
        /* Create connection string (URL) */
        mConnectionString = String.format(mBaseURL, lat, lon, mAPIKey);
        mPreferences = preferences;
        mLatitude = lat;
        mLongitude = lon;
        mDashboard = dashboard;
        mWBGT = 0;
    }

    /* Get URL for connection to weather API */
    private String getAPIConnectionString() {
        return mConnectionString;
    }

    public String doInBackground(String... params) {

        URL url = null;
        try {
            url = new URL(getAPIConnectionString());
        } catch (MalformedURLException e) {
            e.printStackTrace();
        }
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) url.openConnection();
        } catch (IOException e) {
            e.printStackTrace();
        }
        try {
            InputStreamReader in = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8);
            BufferedReader reader = new BufferedReader(in);

            // Only fetching one line from open weather map
            pageText = reader.readLine();
            Log.v("HESTE", "pagetxt: " + pageText);
        } catch (Exception e1) {
            e1.printStackTrace();
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return pageText;
    }

    /**
     * When data has been retrieved from Open Weather Map API, extract and show in views
     * @param pageText String to be converted to JSON Object
     */
    protected void onPostExecute(String pageText) {
        // Get data from response JSON Object
        if(pageText != null && !pageText.equals("")) {
            getJSONResponseContent(pageText);

            // Display data in UI
            setDashboardViewContentFromAPIResponse();

            // Calculate WBGT model parameters
            setAndSaveDashboardWBGTModelParameters();

            ral = new com.android.climapp.wbgt.RecommendedAlertLimitISO7243(
                    // Giving default values if nothing set
                    mPreferences.getString("activity_level", "medium"),
                    mPreferences.getString("Height_value", "1.80"),
                    mPreferences.getInt("Weight", 80));

            String color = ral.getRecommendationColor(wbgt.getWBGT(), ral.calculateRALValue());

            // Set color in view based on RAL interval
            mDashboard.setRecommendationColorAndText(color);
            mDashboard.saveStringToPreferences("color", color);
        }
    }

    private void getJSONResponseContent(String text) {
        try {
            JSONObject json = new JSONObject(text);

            // Values fetched from API response (JSONObject) humidity, pressure, temperature etc.
            humidity = json.getJSONObject(TAG_MAIN).getInt(HUMIDITY);
            pressure = json.getJSONObject(TAG_MAIN).getInt(PRESSURE);
            temperature = json.getJSONObject(TAG_MAIN).getInt(TEMPERATURE);
            wind_speed = json.getJSONObject(TAG_WIND).getDouble(SPEED);
            cloudiness = json.getJSONObject(TAG_CLOUDS).getInt(TAG_ALL);
            city_name = json.getString(TAG_CITY);
            weather_id = json.getJSONArray(TAG_WEATHER).getJSONObject(0).getInt(WEATHER_ID);
            description = json.getJSONArray(TAG_WEATHER).getJSONObject(0).getString(WEATHER_DESCRIPTION);
            icon = json.getJSONArray(TAG_WEATHER).getJSONObject(0).getString(WEATHER_ICON);
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    /**
     * Setting all dashboard content based on Open Weather Map API responses
     */
    private void setDashboardViewContentFromAPIResponse() {
        // Views updated based on data from Open Weather Map
        TextView tempTextView = mDashboard.getActivity().findViewById(R.id.temp_value);
        ImageView weatherImage = mDashboard.getActivity().findViewById(R.id.weather_icon);
        TextView humidityTextView = mDashboard.getActivity().findViewById(R.id.humidity_value);
        TextView windSpeedTextView = mDashboard.getActivity().findViewById(R.id.wind_speed_value);
        TextView cloudinessTextView = mDashboard.getActivity().findViewById(R.id.cloudiness_value);
        TextView cityTextView = mDashboard.getActivity().findViewById(R.id.current_city);
        TextView temperatureUnit = mDashboard.getActivity().findViewById(R.id.temperature_unit);

        User user = new User(mPreferences);
        tempTextView.setText(String.format("%s°", user.setCorrectTemperatureUnit(temperature, mPreferences.getInt("Unit",0))));
        mPreferences.edit().putInt("temperature", Integer.parseInt(temperature.toString())).apply(); // Only to be used locally!
        mDashboard.saveIntToPreferences("temperature", Integer.parseInt(temperature.toString())); // Will be saved
        temperatureUnit.setText(String.format("%s", mDashboard.getResources().getString(getTemperatureUnit())));
        humidityTextView.setText(String.format("%s %s", humidity, "%"));
        windSpeedTextView.setText(String.format("%s m/s", wind_speed));
        cloudinessTextView.setText(String.format("%s %s", cloudiness, "%"));
        cityTextView.setText(String.format("%s, %s", city_name, description));

        // Fetch weather icon using Open Weather Map API response
        getOWMWeatherIcon(weatherImage);
    }

    private void getOWMWeatherIcon(ImageView weatherImage) {
        String imgURL = String.format("http://openweathermap.org/img/w/%s.png", icon);
        // Set image in view directly from URL with Picasso
        Picasso.with(mDashboard.getActivity().getApplicationContext()).load(imgURL).fit().centerInside().into(weatherImage);
    }

    /**
     * Calculate and set all WBGT model parameters and recommended alert limits
     */
    private void setAndSaveDashboardWBGTModelParameters() {
        wbgt = calculateWBGT(wind_speed, humidity, pressure, mPreferences.getInt("temperature", 0));
        TextView WBGTTextView = mDashboard.getActivity().findViewById(R.id.wbgt_value);

        WBGTTextView.setText(String.format("WBGT: %s", wbgt.getWBGT()));
        mDashboard.saveFloatToPreferences("WBGT", (float) wbgt.getWBGT());
        /*// Send notification if values are outside recommended range
        if (wbgt.getWBGT() > 21.0 && !notificationSent) {
            setNotificationChannel();
            createNotification(getString(R.string.app_name), getString(R.string.notificationDescription), notificationID);
            preferences.edit().putBoolean("notification_sent", true).apply();
        }*/
    }
    /**
     * Use calculations for the WBGT mode from JTOF together with basic device input:
     * location, date and time and API response
     *
     * @param wind_speed Wind speed in m/s
     * @param humidity   Humidity in percent
     * @param pressure   pressure in ATM
     * @return wbgt object
     */
    private WBGT calculateWBGT(double wind_speed, double humidity, double pressure, int temperature) {
        User user = new User(mPreferences);
        Calendar calendar = Calendar.getInstance();
        // Total offset (geographical and daylight savings) from UTC in hours
        int utcOffset = (calendar.get(Calendar.ZONE_OFFSET) +
                calendar.get(Calendar.DST_OFFSET)) / (60 * 60000);
        int avg = 10;
        double Tair = user.setCorrectTemperatureUnit(temperature, mPreferences.getInt("Unit",0));
        double zspeed = 2;
        double dT = 0; //Vertical temp difference
        int urban = 0;

        calendar.setTime(new Date());
        int year = calendar.get(Calendar.YEAR);
        int month = calendar.get(Calendar.MONTH);
        int day = calendar.get(Calendar.DAY_OF_MONTH);
        int hour = calendar.get(Calendar.HOUR);
        int min = calendar.get(Calendar.MINUTE);
        calendar.set(year, month, day, hour, min);

        // Precipitation and cloudfraction now depend on data from Open Weather Map
        // cloud fraction is cloudiness in percent divided by 100 to get it as a fraction
        Solar s = new Solar(mLongitude, mLatitude, calendar, utcOffset);
        SolarRad sr = new SolarRad(s.zenith(),
                calendar.get(Calendar.DAY_OF_YEAR),
                cloudiness/100,
                1,
                isItFoggy(weather_id),
                isItRaining(weather_id)); //(solar zenith angle, day no, cloud fraction,
        // cloud type, fog, precipitation)

        // Making all wbgt calculations
        WBGT wbgt = new WBGT(year, month, day, hour, min, utcOffset, avg, mLatitude, mLongitude,
                sr.solarIrradiation(), pressure, Tair, humidity, wind_speed, zspeed, dT, urban);
        return wbgt;
    }

    public int getTemperatureUnit() {
        int unit = mPreferences.getInt("Unit", 0);
        if(unit == 1){
            return R.string.temperature_unit_f;
        } else {
            return R.string.temperature_unit_c;
        }
    }

    /**
     * If weather ID is either "mist" or "fog" the weather is categorized as foggy.
     * @param weather_id ID fetched from Open Weather Map
     * @return boolean value indicating weather it is foggy
     */
    private boolean isItFoggy(Integer weather_id) {
        return (weather_id == 701 || weather_id == 741);
    }

    /**
     * Check whether it is raining based on OWM weather ID
     * @param weather_id weather ID from Open Weather Map
     *                   all ids here:
     *                   https://openweathermap.org/weather-conditions
     * @return true if raining, otherwise false
     */
    private boolean isItRaining(int weather_id) {
        int rainIds[] = {200, 201, 202, 230, 231, 232,
                300, 301, 302, 310, 311, 312, 313, 314, 321,
                500, 501, 502, 503, 504, 511, 520, 521, 522, 531,
                615, 616};
        return Arrays.asList(rainIds).contains(weather_id);
    }
}