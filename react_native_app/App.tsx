import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Globe, Smartphone, HelpCircle } from 'lucide-react-native';

import { StoreScreen } from './src/screens/StoreScreen';
import { MyEsimsScreen } from './src/screens/MyEsimsScreen';
import { SupportScreen } from './src/screens/SupportScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor="#0a0f1d" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0f172a',
            borderTopColor: '#1e293b',
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: '#10b981', // Emerald 500
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tab.Screen
          name="Tienda"
          component={StoreScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Globe color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="Mis eSIMs"
          component={MyEsimsScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Smartphone color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="Soporte"
          component={SupportScreen}
          options={{
            tabBarIcon: ({ color, size }) => <HelpCircle color={color} size={size} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
