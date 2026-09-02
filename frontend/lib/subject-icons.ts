export interface SubjectIconDef {
  id: string;
  name: string;
  category: 'Core CS' | 'Systems & Networks' | 'AI & Data' | 'Development & Cloud' | 'Applied Sciences';
  src: string;
  gradient: string;
  tags: string[];
}

export const SUBJECT_ICONS: SubjectIconDef[] = [
  {
    id: 'datastruct',
    name: 'Data Structures & Algorithms',
    category: 'Core CS',
    src: '/subjects/datastruct.jpg',
    gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    tags: ['dsa', 'data structures', 'arrays', 'trees', 'graphs', 'cs3401', 'cs201'],
  },
  {
    id: 'database',
    name: 'Database Systems & SQL',
    category: 'AI & Data',
    src: '/subjects/database.jpg',
    gradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    tags: ['dbms', 'sql', 'rdbms', 'nosql', 'cs3492', 'db-104'],
  },
  {
    id: 'oop',
    name: 'Object Oriented Programming',
    category: 'Core CS',
    src: '/subjects/oop.jpg',
    gradient: 'linear-gradient(135deg, #f97316, #ea580c)',
    tags: ['java', 'c++', 'oop', 'cs3391', 'classes'],
  },
  {
    id: 'os',
    name: 'Operating Systems & Kernels',
    category: 'Systems & Networks',
    src: '/subjects/os.jpg',
    gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    tags: ['os', 'kernel', 'processes', 'memory', 'cs3451'],
  },
  {
    id: 'networks',
    name: 'Computer Networks & Web',
    category: 'Systems & Networks',
    src: '/subjects/networks.jpg',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    tags: ['networking', 'tcp', 'ip', 'lan', 'cs3361', 'cs304'],
  },
  {
    id: 'ai_ml',
    name: 'Artificial Intelligence & ML',
    category: 'AI & Data',
    src: '/subjects/ai_ml.jpg',
    gradient: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
    tags: ['ai', 'ml', 'machine learning', 'deep learning', 'neural', 'vision'],
  },
  {
    id: 'cloud_cyber',
    name: 'Cloud Computing & Security',
    category: 'Development & Cloud',
    src: '/subjects/cloud_cyber.jpg',
    gradient: 'linear-gradient(135deg, #06b6d4, #0284c7)',
    tags: ['cloud', 'aws', 'cyber', 'security', 'cryptography', 'firewall'],
  },
  {
    id: 'web_mobile',
    name: 'Web & Mobile App Dev',
    category: 'Development & Cloud',
    src: '/subjects/web_mobile.jpg',
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    tags: ['web', 'frontend', 'react', 'mobile', 'android', 'ios', 'cs102', 'cs3111'],
  },
  {
    id: 'software_eng',
    name: 'Software Engineering & DevOps',
    category: 'Development & Cloud',
    src: '/subjects/software_eng.jpg',
    gradient: 'linear-gradient(135deg, #10b981, #0ea5e9)',
    tags: ['devops', 'se', 'testing', 'ci/cd', 'agile', 'git', 'pipeline'],
  },
  {
    id: 'robotics_iot',
    name: 'Robotics & Embedded IoT',
    category: 'Applied Sciences',
    src: '/subjects/robotics_iot.jpg',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    tags: ['iot', 'robotics', 'arduino', 'sensors', 'embedded', 'hardware'],
  },
  {
    id: 'math_algo',
    name: 'Discrete Math & Logic',
    category: 'Core CS',
    src: '/subjects/math_algo.jpg',
    gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    tags: ['math', 'discrete', 'logic', 'algorithms', 'stats', 'probability'],
  },
  {
    id: 'science_physics',
    name: 'Computational Physics & Science',
    category: 'Applied Sciences',
    src: '/subjects/science_physics.jpg',
    gradient: 'linear-gradient(135deg, #ec4899, #06b6d4)',
    tags: ['physics', 'science', 'quantum', 'chemistry', 'electronics', 'circuits'],
  },
];

const CODE_TO_ICON_ID: Record<string, string> = {
  CS3401: 'datastruct',
  CS3492: 'database',
  CS3391: 'oop',
  CS3451: 'os',
  CS3361: 'networks',
  CS3111: 'web_mobile',
  CS102: 'web_mobile',
  CS201: 'math_algo',
  CS304: 'networks',
};

export function getSubjectIconDef(iconKey?: string, code?: string, name?: string, index = 0): SubjectIconDef {
  // 1. Exact match on iconKey
  if (iconKey) {
    const found = SUBJECT_ICONS.find(i => i.id === iconKey.toLowerCase().trim());
    if (found) return found;
  }

  // 2. Code match
  const cleanCode = (code || '').toUpperCase().trim();
  if (cleanCode && CODE_TO_ICON_ID[cleanCode]) {
    const found = SUBJECT_ICONS.find(i => i.id === CODE_TO_ICON_ID[cleanCode]);
    if (found) return found;
  }

  // 3. Name fuzzy match
  const cleanName = (name || '').toLowerCase();
  if (cleanName) {
    if (cleanName.includes('data struct') || cleanName.includes('dsa')) {
      return SUBJECT_ICONS.find(i => i.id === 'datastruct')!;
    }
    if (cleanName.includes('data') || cleanName.includes('sql') || cleanName.includes('db')) {
      return SUBJECT_ICONS.find(i => i.id === 'database')!;
    }
    if (cleanName.includes('object') || cleanName.includes('oop') || cleanName.includes('java')) {
      return SUBJECT_ICONS.find(i => i.id === 'oop')!;
    }
    if (cleanName.includes('operat') || cleanName.includes('kernel') || cleanName.includes('system')) {
      return SUBJECT_ICONS.find(i => i.id === 'os')!;
    }
    if (cleanName.includes('network') || cleanName.includes('web tech')) {
      return SUBJECT_ICONS.find(i => i.id === 'networks')!;
    }
    if (cleanName.includes('ai') || cleanName.includes('intelligence') || cleanName.includes('machine learning')) {
      return SUBJECT_ICONS.find(i => i.id === 'ai_ml')!;
    }
    if (cleanName.includes('cloud') || cleanName.includes('security') || cleanName.includes('cyber')) {
      return SUBJECT_ICONS.find(i => i.id === 'cloud_cyber')!;
    }
    if (cleanName.includes('python') || cleanName.includes('web') || cleanName.includes('mobile')) {
      return SUBJECT_ICONS.find(i => i.id === 'web_mobile')!;
    }
    if (cleanName.includes('robot') || cleanName.includes('iot') || cleanName.includes('embedded')) {
      return SUBJECT_ICONS.find(i => i.id === 'robotics_iot')!;
    }
    if (cleanName.includes('math') || cleanName.includes('algo')) {
      return SUBJECT_ICONS.find(i => i.id === 'math_algo')!;
    }
    if (cleanName.includes('physic') || cleanName.includes('science')) {
      return SUBJECT_ICONS.find(i => i.id === 'science_physics')!;
    }
    if (cleanName.includes('software') || cleanName.includes('devops')) {
      return SUBJECT_ICONS.find(i => i.id === 'software_eng')!;
    }
  }

  // 4. Default fallback by cyclic index
  return SUBJECT_ICONS[index % SUBJECT_ICONS.length];
}
