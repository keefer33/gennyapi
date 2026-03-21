/** Nested select for user_generations list/detail (matches genny generateStore). */
export const USER_GENERATION_SELECT = `
  *,
  models(*),
  user_generation_files(
    file_id,
    user_files(
      *,
      user_file_tags(
        tag_id,
        created_at,
        user_tags(*)
      )
    )
  )
`;
