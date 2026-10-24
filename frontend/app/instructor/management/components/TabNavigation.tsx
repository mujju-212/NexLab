'use client';

import React from 'react';
import {
  LayoutDashboard,
  Users,
  Brain,
  AlertTriangle,
  HeartHandshake,
  CalendarClock,
  UserCheck,
  BarChart3,
} from 'lucide-react';
import styles from '../class-management.module.css';

export type ManagementTab =
  | 'overview'
  | 'students'
  | 'concept-mastery'
  | 'early-warnings'
  | 'interventions'
  | 'deadline-relief'
  | 'attendance'
  | 'analytics';

interface TabNavigationProps {
  activeTab: ManagementTab;
  onTabChange: (tab: ManagementTab) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const tabs = [
    { id: 'overview' as ManagementTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'students' as ManagementTab, label: 'Students', icon: Users },
    { id: 'concept-mastery' as ManagementTab, label: 'Concept Mastery', icon: Brain },
    { id: 'early-warnings' as ManagementTab, label: 'Early Warnings', icon: AlertTriangle },
    { id: 'interventions' as ManagementTab, label: 'Interventions', icon: HeartHandshake },
    { id: 'deadline-relief' as ManagementTab, label: 'Deadline Relief', icon: CalendarClock },
    { id: 'attendance' as ManagementTab, label: 'Attendance', icon: UserCheck },
    { id: 'analytics' as ManagementTab, label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className={styles.tabBar}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <Icon size={14} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};
