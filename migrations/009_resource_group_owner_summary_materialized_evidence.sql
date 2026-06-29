create or replace view runtime_resource_group_owner_summary as
with active_candidate_records as (
  select
    concat(
      'resourceGroup:',
      lower(trim(candidate."subscriptionId")),
      ':',
      lower(trim(candidate."resourceGroup"))
    ) as "targetKey",
    candidate.*
  from runtime_owner_evidence_materialized candidate
  where candidate."targetKind" = 'resourceGroup'
    and not exists (
      select 1
      from disabled_owner_evidence_keys disabled
      where disabled.provider = 'azure'
        and (
          lower(trim(disabled.owner_key)) = lower(trim(candidate."evidenceKey"))
          or lower(trim(disabled.owner_key)) = lower(trim(candidate."ownerCandidate"))
        )
    )
),
deduped_owner_candidates as (
  select * exclude duplicate_rank
  from (
    select
      *,
      row_number() over (
        partition by "targetKey", "ownerCandidate"
        order by
          case confidence
            when 'high' then 3
            when 'medium' then 2
            when 'low' then 1
            else 0
          end desc,
          case "ownerType"
            when 'ownerGroup' then 5
            when 'ownerTag' then 4
            when 'ownerUser' then 3
            when 'application' then 2
            when 'unknown' then 1
            else 0
          end desc,
          priority asc,
          lower(trim(owner)) asc,
          lower(trim("evidenceKey")) asc
      ) as duplicate_rank
    from active_candidate_records
  ) duplicate_owner_candidates
  where duplicate_rank = 1
),
selected_owner_candidates as (
  select
    *,
    row_number() over (
      partition by "targetKey"
      order by
        case confidence
          when 'high' then 3
          when 'medium' then 2
          when 'low' then 1
          else 0
        end desc,
        case "ownerType"
          when 'ownerGroup' then 5
          when 'ownerTag' then 4
          when 'ownerUser' then 3
          when 'application' then 2
          when 'unknown' then 1
          else 0
        end desc,
        priority asc,
        lower(trim(owner)) asc,
        lower(trim("evidenceKey")) asc
    ) as candidate_rank
  from deduped_owner_candidates
)
select
  "targetKey",
  first(owner order by candidate_rank) as owner,
  first(source order by candidate_rank) as source,
  case max(case confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end)
    when 3 then 'high'
    when 2 then 'medium'
    when 1 then 'low'
    else 'none'
  end as confidence,
  to_json(list(
    struct_pack(
      key := "ownerCandidate",
      displayName := owner,
      type := "ownerType",
      confidence := confidence,
      source := case
        when source like 'tag.%' then 'tag'
        when source like 'activity.%' then 'activity'
        else source
      end,
      rank := candidate_rank,
      evidence := [
        struct_pack(user := "evidenceValue", date := "evidenceDate", key := "evidenceKey")
      ],
      relatedScopes := [
        struct_pack(
          subscriptionId := "subscriptionId",
          subscriptionName := "subscriptionName",
          resourceGroup := "resourceGroup"
        )
      ]
    )
    order by candidate_rank
  )) as "ownerCandidates",
  to_json([first(
    struct_pack(user := "evidenceValue", date := "evidenceDate", key := "evidenceKey")
    order by candidate_rank
  )]) as evidence
from selected_owner_candidates
group by "targetKey";
