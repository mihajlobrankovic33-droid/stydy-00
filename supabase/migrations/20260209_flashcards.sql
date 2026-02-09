-- Flashcard sets table
create table if not exists public.flashcard_sets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    title text not null,
    subject text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Flashcards table
create table if not exists public.flashcards (
    id uuid default gen_random_uuid() primary key,
    set_id uuid references public.flashcard_sets(id) on delete cascade not null,
    front_content text not null,
    back_content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;

-- Policies for flashcard_sets
create policy "Users can view their own flashcard sets"
    on public.flashcard_sets for select
    using (auth.uid() = user_id);

create policy "Users can insert their own flashcard sets"
    on public.flashcard_sets for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own flashcard sets"
    on public.flashcard_sets for update
    using (auth.uid() = user_id);

create policy "Users can delete their own flashcard sets"
    on public.flashcard_sets for delete
    using (auth.uid() = user_id);

-- Policies for flashcards
create policy "Users can view flashcards in their sets"
    on public.flashcards for select
    using (exists (
        select 1 from public.flashcard_sets
        where id = flashcards.set_id and user_id = auth.uid()
    ));

create policy "Users can insert flashcards into their sets"
    on public.flashcards for insert
    with check (exists (
        select 1 from public.flashcard_sets
        where id = flashcards.set_id and user_id = auth.uid()
    ));

create policy "Users can update flashcards in their sets"
    on public.flashcards for update
    using (exists (
        select 1 from public.flashcard_sets
        where id = flashcards.set_id and user_id = auth.uid()
    ));

create policy "Users can delete flashcards in their sets"
    on public.flashcards for delete
    using (exists (
        select 1 from public.flashcard_sets
        where id = flashcards.set_id and user_id = auth.uid()
    ));
