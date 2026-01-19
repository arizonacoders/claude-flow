interface TabNavigationProps {
  activeTab: 'active' | 'completed' | 'stats';
  onTabChange: (tab: 'active' | 'completed' | 'stats') => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs = [
    { id: 'active' as const, label: 'Active' },
    { id: 'completed' as const, label: 'Completed' },
    { id: 'stats' as const, label: 'Project Stats' },
  ];

  return (
    <nav className="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
