import InstitutionsClient from './InstitutionsClient';

export const metadata = {
  title: 'Institutions — NexLab Platform Admin',
  description: 'Manage all registered institutions on the NexLab platform',
};

export default function InstitutionsPage() {
  return <InstitutionsClient />;
}
