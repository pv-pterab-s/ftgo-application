package net.chrisrichardson.ftgo.common;


import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class MoneyTest {

  private final int M1_AMOUNT = 10;
  private final int M2_AMOUNT = 15;

  private Money m1 = new Money(M1_AMOUNT);
  private Money m2 = new Money(M2_AMOUNT);

  @Test
  public void shouldReturnAsString() {
    assertEquals(Integer.toString(M1_AMOUNT), new Money(M1_AMOUNT).asString());
  }

  @Test
  public void shouldCompare() {
    assertTrue(m2.isGreaterThanOrEqual(m2));
    assertTrue(m2.isGreaterThanOrEqual(m1));
    assertFalse(m1.isGreaterThanOrEqual(m2));
  }

  @Test
  public void shouldAdd() {
    assertEquals(new Money(M1_AMOUNT + M2_AMOUNT), m1.add(m2));
  }

  @Test
  public void shouldMultiply() {
    int multiplier = 12;
    assertEquals(new Money(M2_AMOUNT * multiplier), m2.multiply(multiplier));
  }

  @Test
  public void shouldTreatAmountsWithDifferentScalesAsEqual() {
    Money priceWithOneDecimalPlace = new Money("12.0");
    Money priceWithTwoDecimalPlaces = new Money("12.00");

    assertEquals(priceWithOneDecimalPlace, priceWithTwoDecimalPlaces);
    assertEquals(priceWithOneDecimalPlace.hashCode(), priceWithTwoDecimalPlaces.hashCode());
  }

  @Test
  public void shouldConvertAnExactDecimalAmountToCents() {
    assertEquals(Long.valueOf(1234), new Money("12.34").asLong());
  }

  @Test
  public void shouldRejectFractionsOfACentWhenConvertingToCents() {
    try {
      new Money("12.345").asLong();
      fail("expected conversion to reject fractions of a cent");
    } catch (ArithmeticException ignored) {
    }
  }



}
