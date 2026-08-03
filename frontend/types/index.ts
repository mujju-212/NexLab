// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  createdAt: string;
  updatedAt: string;
}

// Experiment types
export interface Experiment {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  tasks: Task[];
  createdBy: string;
  createdAt: string;
}

export interface Task {
  id: string;
  experimentId: string;
  title: string;
  description: string;
  starterCode?: string;
  testCases: TestCase[];
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

// Session types
export interface Session {
  id: string;
  experimentId: string;
  batchId: string;
  sectionId: string;
  scheduledAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
}

// Submission types
export interface Submission {
  id: string;
  sessionId: string;
  studentId: string;
  code: string;
  language: string;
  status: 'PENDING' | 'RUNNING' | 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR' | 'TIME_LIMIT';
  score?: number;
  feedback?: string;
  submittedAt: string;
}

// Analytics types
export interface KnowledgeMastery {
  conceptId: string;
  conceptName: string;
  masteryLevel: number; // 0–1
  lastUpdated: string;
}

export interface PlatformStats {
  totalStudents: number;
  totalInstructors: number;
  activeSessions: number;
  submissionsToday: number;
  avgScore: number;
}
