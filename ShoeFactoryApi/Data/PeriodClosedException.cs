namespace ShoeFactoryApi.Data
{
    /// <summary>Thrown when a save touches a record dated in a closed month; the API answers 400 with this message.</summary>
    public class PeriodClosedException : Exception
    {
        public DateOnly Month { get; }

        public PeriodClosedException(DateOnly month)
            : base($"{month:MMMM yyyy} is closed. Nothing dated in it can be added, changed or removed. An Admin can reopen the month on the Users page.")
        {
            Month = month;
        }
    }
}
