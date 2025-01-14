package com.android.climapp;

import android.os.Bundle;
import android.support.design.widget.TabLayout;
import android.support.v4.view.PagerAdapter;
import android.support.v4.view.ViewPager;
import android.support.v7.app.AppCompatActivity;

import com.android.climapp.utils.FragmentPagerAdapter;

import static com.android.climapp.utils.ApplicationConstants.DASHBOARD;
import static com.android.climapp.utils.ApplicationConstants.SETTINGS;

/**
 * Created by frksteenhoff on 29-10-2017.
 * Setting correct tab layout upon opening the app
 */

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.dashboard_activity);

        TabLayout tabLayout = findViewById(R.id.tab_layout);
        //tabLayout.addTab(tabLayout.newTab().setIcon(R.drawable.round_settings_white_18dp));
        //tabLayout.addTab(tabLayout.newTab().setIcon(R.drawable.round_dashboard_white_18dp));

        tabLayout.addTab(tabLayout.newTab().setText(SETTINGS));
        tabLayout.addTab(tabLayout.newTab().setText(DASHBOARD));
        //tabLayout.addTab(tabLayout.newTab().setText("Clothing"));
        tabLayout.setTabGravity(TabLayout.GRAVITY_FILL);

        final ViewPager viewPager = findViewById(R.id.pager);
        final PagerAdapter adapter = new FragmentPagerAdapter
                (getSupportFragmentManager(), tabLayout.getTabCount());
        viewPager.setAdapter(adapter);
        // Setting dashboard as default screen
        viewPager.setCurrentItem(1);
        viewPager.addOnPageChangeListener(new TabLayout.TabLayoutOnPageChangeListener(tabLayout));

        tabLayout.addOnTabSelectedListener(new TabLayout.OnTabSelectedListener() {
            @Override
            public void onTabSelected(TabLayout.Tab tab) {
                viewPager.setCurrentItem(tab.getPosition());
            }

            @Override
            public void onTabUnselected(TabLayout.Tab tab) {
            }

            @Override
            public void onTabReselected(TabLayout.Tab tab) {
            }
        });
    }
}
