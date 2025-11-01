export const SAMPLE_DBML = `Table users {
  id integer [pk, increment]
  username varchar(50) [unique, not null]
  email varchar(255) [unique, not null]
  age integer [default: 18, note: 'Must be 18+']
  balance decimal(10,2) [default: 0.00]
  status enum('active', 'inactive') [default: 'active']
  created_at timestamp [default: \`now()\`]
  updated_at timestamp
}

Table posts {
  id integer [pk, increment]
  user_id integer [not null, note: 'References users.id']
  title varchar(200) [not null]
  content text
  created_at timestamp [default: \`now()\`]
}

Ref: posts.user_id > users.id [delete: CASCADE, update: CASCADE]`;
