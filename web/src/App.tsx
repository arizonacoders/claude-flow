import { useState, useEffect } from 'react';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { ProjectSelector } from './components/ProjectSelector';
import { TabNavigation } from './components/TabNavigation';
import { CompletedList } from './components/CompletedList';
import { ProjectStats } from './components/ProjectStats';
import type { Issue } from './types';
import './App.css';

// Parse issue number from URL path like /issue/1
function getIssueIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/issue\/(\d+)/);
  return match ? match[1] : null;
}

// Get saved project from localStorage
function getSavedProjectId(): string | null {
  return localStorage.getItem('selectedProjectId');
}

function App() {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(getIssueIdFromUrl);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(getSavedProjectId);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'stats'>('active');

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setSelectedIssueId(getIssueIdFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Save project selection to localStorage
  const handleSelectProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    if (projectId) {
      localStorage.setItem('selectedProjectId', projectId);
    } else {
      localStorage.removeItem('selectedProjectId');
    }
  };

  const handleSelectIssue = (issue: Issue) => {
    // Use issue number for URL and state
    setSelectedIssueId(String(issue.number));
    window.history.pushState({}, '', `/issue/${issue.number}`);
  };

  const handleBack = () => {
    setSelectedIssueId(null);
    window.history.pushState({}, '', '/');
  };

  const handleTitleClick = () => {
    if (selectedIssueId) {
      setSelectedIssueId(null);
      window.history.pushState({}, '', '/');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title" onClick={handleTitleClick} style={{ cursor: 'pointer' }}>
            claude-flow
          </h1>
        </div>
        <div className="app-header-right">
          <ProjectSelector
            selectedProjectId={selectedProjectId}
            onSelectProject={handleSelectProject}
          />
        </div>
      </header>

      <main className="app-main">
        {selectedIssueId ? (
          <IssueDetail
            issueId={selectedIssueId}
            onBack={handleBack}
            onSelectIssue={handleSelectIssue}
          />
        ) : (
          <>
            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
            {activeTab === 'active' && (
              <IssueList onSelectIssue={handleSelectIssue} projectId={selectedProjectId} />
            )}
            {activeTab === 'completed' && (
              <CompletedList onSelectIssue={handleSelectIssue} projectId={selectedProjectId} />
            )}
            {activeTab === 'stats' && (
              <ProjectStats projectId={selectedProjectId} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
