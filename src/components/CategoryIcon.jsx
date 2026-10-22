const SPRITE_COLUMNS = 4;

export default function CategoryIcon({ category, className = "" }) {
  if (category?.iconImage) {
    return (
      <span className={`cat-icon ${className}`.trim()} aria-hidden="true">
        <img className="cat-icon__image" src={category.iconImage} alt="" />
      </span>
    );
  }

  if (!category?.iconCell && category?.iconCell !== 0) {
    return <span className={`cat-icon ${className}`.trim()}>{category?.icon}</span>;
  }

  const column = category.iconCell % SPRITE_COLUMNS;
  const row = Math.floor(category.iconCell / SPRITE_COLUMNS);

  return (
    <span className={`cat-icon ${className}`.trim()} aria-hidden="true">
      <span
        className="cat-icon__sprite"
        style={{
          backgroundPosition: `${column * (100 / (SPRITE_COLUMNS - 1))}% ${row * (100 / (SPRITE_COLUMNS - 1))}%`,
        }}
      />
    </span>
  );
}
