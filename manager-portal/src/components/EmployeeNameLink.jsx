import { Link } from 'react-router-dom';

export default function EmployeeNameLink({ employee, toPrefix = '/team' }) {
  const id = employee?._id?.toString?.() || employee?._id || employee?.id;
  const name = employee?.name;
  if (!id || !name) return <span>{name || '—'}</span>;
  return (
    <Link className="btn secondary name-link" to={`${toPrefix}/${id}`}>
      {name}
    </Link>
  );
}
